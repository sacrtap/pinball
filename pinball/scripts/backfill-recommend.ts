/**
 * 历史局推荐快照滚动回填（一次性运维脚本）。
 *
 * 背景：commit ea8eae6 之前录入的局 recommendedPower / recommendMode /
 * predictedHitProb 全为 null，导致 stats 页 backtest() n=0、全 0。
 *
 * 做法：按 createdAt 顺序重放该租户全部 Round，每局只用该局之前的
 * Posterior 状态跑 Thompson 采样，回写三字段。重放在内存中进行——
 * 不写 Posterior、不偷看未来数据，因此不污染当前统计。
 *
 * 用法：pnpm backfill:recommend <tenantId>
 */
import { withTenant } from '@/lib/db/tenant';
import { prisma } from '@/lib/db/prisma';
import * as repo from '@/lib/db/repo';
import { recommendFromCounts, type ArmCountsInput } from '@/lib/predict/bandit';
import { aggregateGlobalPrior, alpha0TableFrom } from '@/lib/predict/pooling';
import { HOLE_COUNT, POWER_LEVELS, SAMPLE_THRESHOLD } from '@/lib/rules';
import type { PowerLevel } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 落点计入该档后验（与 posterior.ts `counts[hole - 1] += 1` 同语义） */
function accumulate(counts: number[], landHole: number): void {
  if (landHole >= 1 && landHole <= counts.length) counts[landHole - 1] += 1;
}

/** 三档合计样本数（= 该机台已重放局数） */
function sampleNOf(counts: Record<PowerLevel, number[]>): number {
  return POWER_LEVELS.reduce((s, p) => s + counts[p].reduce((a, b) => a + b, 0), 0);
}

async function main(): Promise<void> {
  const tenantId = process.argv[2];
  if (!tenantId || !UUID_RE.test(tenantId)) {
    console.error('用法：pnpm backfill:recommend <tenantId>（tenantId 须为 UUID）');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('缺少 DATABASE_URL：请通过 pnpm 脚本运行（自动加载 .env）');
    process.exit(1);
  }

  // L4 先验聚合走 BYPASSRLS 独立连接，必须在事务外调用（与 /api/recommend 同源）
  const priorRows = await aggregateGlobalPrior();
  const alpha0Table = alpha0TableFrom(priorRows);

  // 全部局（不限 recommendedPower）：已有推荐的局也参与 counts 重放，
  // 保证后续局的样本数是完整历史口径；但只回写 null 的局（幂等）。
  const rounds = await withTenant(tenantId, (tx) =>
    tx.round.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        machineId: true,
        power: true,
        multiplier: true,
        litHoles: true,
        totalBet: true,
        landHole: true,
        recommendedPower: true,
      },
    }),
  );

  if (rounds.length === 0) {
    console.log(`租户 ${tenantId} 无 Round，无需回填`);
    return;
  }

  const byMachine = new Map<string, Record<PowerLevel, number[]>>();
  let backfilled = 0;
  let deferred = 0;
  let noLit = 0;

  await withTenant(tenantId, async (tx) => {
    for (const round of rounds) {
      let machineCounts = byMachine.get(round.machineId);
      if (!machineCounts) {
        // 从零重放：不读当前 DB Posterior，保证第 i 局只见前 i-1 局
        machineCounts = {
          low: new Array<number>(HOLE_COUNT).fill(0),
          mid: new Array<number>(HOLE_COUNT).fill(0),
          high: new Array<number>(HOLE_COUNT).fill(0),
        };
        byMachine.set(round.machineId, machineCounts);
      }

      // 先按「该局之前」的状态推荐，再把本局结果累加进 counts
      if (round.recommendedPower === null) {
        if (round.litHoles.length === 0) {
          noLit += 1;
        } else if (sampleNOf(machineCounts) >= SAMPLE_THRESHOLD) {
          const arms: ArmCountsInput[] = POWER_LEVELS.map((power) => ({
            power,
            counts: machineCounts[power],
          }));
          const rec = recommendFromCounts(round.machineId, round.litHoles, arms, {
            totalBet: round.totalBet,
            multiplier: round.multiplier,
            alpha0Table,
          });
          await repo.updateRound(tx, round.id, {
            recommendedPower: rec.thompsonPower,
            // 与 EntryWizard.tsx 提交口径一致：degraded → prior
            recommendMode: rec.degraded ? 'prior' : 'thompson',
            predictedHitProb: rec.litHitProb,
          });
          backfilled += 1;
        } else {
          // 样本不足：/api/recommend 降级分支不返回 thompsonPower，
          // 实际录入流本就写 null —— 保持同样语义，不伪造推荐。
          deferred += 1;
        }
      }

      accumulate(machineCounts[round.power as PowerLevel], round.landHole);
    }
  });

  console.log(`回填完成：租户 ${tenantId}`);
  console.log(`  重放 ${rounds.length} 局 / ${byMachine.size} 台机台`);
  console.log(`  已回填 ${backfilled} 局（sampleN≥${SAMPLE_THRESHOLD}，写入推荐快照）`);
  console.log(`  样本不足 ${deferred} 局（保持 null，与录入流降级语义一致）`);
  if (noLit > 0) console.log(`  亮灯缺失 ${noLit} 局（跳过）`);
}

main()
  .catch((e) => {
    console.error('回填失败：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
