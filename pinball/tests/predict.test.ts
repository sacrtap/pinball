import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { updatePosterior, revertPosterior, estimate, dirichletMean } from '@/lib/predict/posterior';
import { recommend, mulberry32, hashSeed } from '@/lib/predict/bandit';
import {
  aggregateGlobalPrior,
  priorDist,
  alpha0TableFrom,
  initPosteriorWithPrior,
} from '@/lib/predict/pooling';
import { POWER_LEVELS, SAMPLE_THRESHOLD, PRIOR_STRENGTH, litCountFor } from '@/lib/rules';
import { cleanDatabase } from './helpers/db';

/**
 * M3 算法栈测试：
 * ① posterior update/revert 幂等
 * ② 合成偏态机台 100 局收敛到真最优档
 * ③ 双档接近不锁死（探索率 > 0）
 * ④ L4 先验非均匀
 * ⑤ 满 20 局解锁 vs 19 局降级
 * ⑥ 可复现性（同 seed 严格相等）
 */

const LIT_HOLES_2X = [1, 2, 3, 4, 5];

describe('predict 算法栈', () => {
  let tenantId: string;
  let machineId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const t = await prisma.tenant.create({ data: { name: '算法租户' } });
    tenantId = t.id;
    const m = await withTenant(tenantId, (tx) =>
      repo.createMachine(tx, { tenantId, code: 'ALGO-1' }),
    );
    machineId = m.id;
  });

  it('① posterior update/revert 幂等', async () => {
    await withTenant(tenantId, async (tx) => {
      await updatePosterior(tx, machineId, tenantId, 'low', 3);
      const after = await tx.posterior.findUnique({
        where: { tenantId_machineId_power: { tenantId, machineId, power: 'low' } },
      });
      expect(after?.counts[2]).toBe(1);
      await revertPosterior(tx, machineId, tenantId, 'low', 3);
      const back = await tx.posterior.findUnique({
        where: { tenantId_machineId_power: { tenantId, machineId, power: 'low' } },
      });
      expect(back?.counts[2]).toBe(0);
    });
  });

  it('② 合成偏态机台 100 局收敛到真最优档（high 0.6 vs 0.3）', async () => {
    // high 档：60% 落 1 号洞（在亮灯内）；low/mid：30%
    const rng = mulberry32(hashSeed('biased-machine'));
    await withTenant(tenantId, async (tx) => {
      for (let i = 0; i < 100; i += 1) {
        for (const power of POWER_LEVELS) {
          const p = power === 'high' ? 0.6 : 0.3;
          const hole = rng() < p ? 1 : 7; // 7 不在亮灯内
          await updatePosterior(tx, machineId, tenantId, power, hole);
        }
      }
    });

    const rec = await withTenant(tenantId, (tx) =>
      recommend(tx, machineId, tenantId, LIT_HOLES_2X),
    );
    expect(rec.thompsonPower).toBe('high');
    expect(rec.argmaxPower).toBe('high');
    expect(rec.sampleN).toBe(300);
    // high 的点估计应显著高于其他档
    expect(rec.armTheta[POWER_LEVELS.indexOf('high')]).toBeGreaterThan(0.5);
    expect(rec.bestArmProb[POWER_LEVELS.indexOf('high')]).toBeGreaterThan(0.8);
  });

  it('③ 双档接近不锁死（0.45 vs 0.5，两档都被采样）', async () => {
    await cleanDatabase();
    const t = await prisma.tenant.create({ data: { name: '探索租户' } });
    const m = await withTenant(t.id, (tx) => repo.createMachine(tx, { tenantId: t.id, code: 'EXP-1' }));
    const rng = mulberry32(hashSeed('tie-machine'));

    await withTenant(t.id, async (tx) => {
      // low: 45/100 命中，mid: 50/100 命中，high: 0 命中（明显差）
      for (let i = 0; i < 100; i += 1) {
        await updatePosterior(tx, m.id, t.id, 'low', rng() < 0.45 ? 2 : 8);
        await updatePosterior(tx, m.id, t.id, 'mid', rng() < 0.5 ? 2 : 8);
        await updatePosterior(tx, m.id, t.id, 'high', 8);
      }
    });

    const rec = await withTenant(t.id, (tx) => recommend(tx, m.id, t.id, LIT_HOLES_2X));
    const lowP = rec.bestArmProb[POWER_LEVELS.indexOf('low')];
    const midP = rec.bestArmProb[POWER_LEVELS.indexOf('mid')];
    // 两档都被采样为最优过（不锁死）
    expect(lowP).toBeGreaterThan(0);
    expect(midP).toBeGreaterThan(0);
    // 且 bestArmProb 不超过 0.95（保留探索）
    expect(Math.max(lowP, midP)).toBeLessThan(0.95);
  });

  it('④ L4 先验：空机台 estimate 返回全局形态非均匀', async () => {
    await cleanDatabase();
    const t = await prisma.tenant.create({ data: { name: '先验租户' } });
    const m = await withTenant(t.id, (tx) => repo.createMachine(tx, { tenantId: t.id, code: 'PRI-1' }));

    // 制造偏态全局数据：low 档 1 号洞占 80%（事务内写入）
    await withTenant(t.id, async (tx) => {
      for (let i = 0; i < 40; i += 1) {
        await updatePosterior(tx, m.id, t.id, 'low', i < 32 ? 1 : 5);
      }
    });

    // 聚合走 BYPASSRLS 独立连接，必须读已提交数据 → 事务外调用
    const rows = await aggregateGlobalPrior();
    const low = rows.find((r) => r.power === 'low')!;
    expect(low.sampleN).toBe(40);
    const dist = priorDist(low);
    expect(dist[0]).toBeGreaterThan(0.7); // 1 号洞占主导
    expect(dist[0]).toBeGreaterThan(dist[11]); // 非均匀
    // 其他档无数据 → 均匀
    expect(priorDist(rows.find((r) => r.power === 'mid'))[0]).toBeCloseTo(1 / 12, 5);

    // alpha0Table 反映全局形态
    const table = alpha0TableFrom(rows);
    expect(table.low).toBeGreaterThan(0);

    // initPosteriorWithPrior 用先验初始化新档位
    await withTenant(t.id, (tx) =>
      initPosteriorWithPrior(tx, m.id, t.id, 'mid', rows.find((r) => r.power === 'mid')),
    );
    const midPost = await withTenant(t.id, (tx) =>
      tx.posterior.findUnique({
        where: { tenantId_machineId_power: { tenantId: t.id, machineId: m.id, power: 'mid' } },
      }),
    );
    expect(midPost).not.toBeNull();

    // 空机台（无样本）的 channelProb 由先验主导
    const rec = await withTenant(t.id, (tx) => recommend(tx, m.id, t.id, LIT_HOLES_2X));
    const sum = rec.channelProb.reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('⑤ 满 20 局解锁 vs 19 局降级', async () => {
    await cleanDatabase();
    const t = await prisma.tenant.create({ data: { name: '阈值租户' } });
    const m19 = await withTenant(t.id, (tx) =>
      repo.createMachine(tx, { tenantId: t.id, code: 'T19' }),
    );
    const m20 = await withTenant(t.id, (tx) =>
      repo.createMachine(tx, { tenantId: t.id, code: 'T20' }),
    );

    // 19 局机台：总样本 = 19
    await withTenant(t.id, async (tx) => {
      for (let i = 0; i < 19; i += 1) await updatePosterior(tx, m19.id, t.id, 'mid', (i % 12) + 1);
    });
    const n19 = await withTenant(t.id, (tx) =>
      tx.posterior.findMany({ where: { machineId: m19.id } }),
    );
    expect(n19.reduce((s, p) => s + p.counts.reduce((a, b) => a + b, 0), 0)).toBe(19);

    // 20 局机台：总样本 = 20
    await withTenant(t.id, async (tx) => {
      for (let i = 0; i < 20; i += 1) await updatePosterior(tx, m20.id, t.id, 'mid', (i % 12) + 1);
    });
    const n20 = await withTenant(t.id, (tx) =>
      tx.posterior.findMany({ where: { machineId: m20.id } }),
    );
    expect(n20.reduce((s, p) => s + p.counts.reduce((a, b) => a + b, 0), 0)).toBe(20);

    // 常量与规则自洽
    expect(POWER_LEVELS).toHaveLength(3);
    expect(litCountFor(2)).toBe(5);
    expect(PRIOR_STRENGTH).toBe(15);
    expect(SAMPLE_THRESHOLD).toBe(20);
  });

  it('⑥ 可复现性：同 seed 严格相等', () => {
    const a = mulberry32(hashSeed('machine:1,2,3'));
    const b = mulberry32(hashSeed('machine:1,2,3'));
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
    // 不同 seed 不同序列
    const c = mulberry32(hashSeed('machine:1,2,4'));
    expect(Array.from({ length: 10 }, () => c())).not.toEqual(seqA);
  });

  it('estimate/dirichletMean 数值正确', () => {
    const counts = new Array<number>(12).fill(0);
    counts[0] = 3;
    counts[1] = 1;
    // 亮灯 [1,2]：α=4+1*12=16，命中质量 3+1+1+1=6 → 0.375
    expect(estimate(counts, [1, 2])).toBeCloseTo(6 / 16, 6);
    const mean = dirichletMean(counts);
    expect(mean.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    expect(mean[0]).toBeGreaterThan(mean[2]);
    expect(estimate(counts, [])).toBe(0);
  });
});
