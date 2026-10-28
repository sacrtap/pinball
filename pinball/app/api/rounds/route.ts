import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { getCurrentTenantId } from '@/lib/auth/session';
import { RoundInputSchema } from '@/lib/schemas';
import { computeCards, computeReward, isHit } from '@/lib/rules';
import { updatePosterior } from '@/lib/predict/posterior';
import { updateBanditArm } from '@/lib/predict/bandit';
import { enqueueMonteCarlo } from '@/lib/queue/redis';
import { MC_REFIT_THRESHOLDS } from '@/lib/rules';

/**
 * POST /api/rounds：单局录入（幂等事务）。
 * 事务内：①幂等检查 clientRequestId ②round.create ③session 冗余统计更新
 * ④L1 posterior +1 ⑤L3 bandit 臂更新。
 */
export async function POST(request: Request) {
  const tenantId = await getCurrentTenantId();
  const body = await request.json().catch(() => null);
  const parsed = RoundInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const round = await withTenant(tenantId, async (tx) => {
    // ① 幂等：命中唯一键直接返回既有记录（离线重放/重复提交不双写）
    const existing = await repo.findRoundByIdempotencyKey(tx, tenantId, input.sessionId, input.clientRequestId);
    if (existing) return { round: existing, deduped: true as const };

    const session = await repo.getSession(tx, input.sessionId);
    if (!session) throw new Error('SESSION_NOT_FOUND');

    // ② 派生字段
    const totalBet = input.baseBet + input.extraBet;
    const hit = isHit(input.landHole, input.litHoles);
    const reward = computeReward(totalBet, input.multiplier, hit);
    const cardIssued = computeCards(reward);
    const seq = session.roundCount + 1;

    // ③ round.create
    const created = await repo.createRound(tx, {
      tenantId,
      sessionId: input.sessionId,
      machineId: input.machineId,
      seq,
      multiplier: input.multiplier,
      litHoles: input.litHoles,
      baseBet: input.baseBet,
      extraBet: input.extraBet,
      totalBet,
      power: input.power,
      landHole: input.landHole,
      hit,
      reward,
      cardIssued,
      recommendedPower: input.recommendedPower ?? null,
      recommendMode: input.recommendMode ?? null,
      clientRequestId: input.clientRequestId,
    });

    // 样本跨阈值检测（供 M4 入队）
    const counts = await tx.posterior.findMany({
      where: { machineId: input.machineId, power: input.power },
      select: { counts: true },
    });
    const sampleN = counts.reduce((s, p) => s + p.counts.reduce((a, b) => a + b, 0), 0);

    // ④ session 冗余统计
    await tx.session.update({
      where: { id: input.sessionId },
      data: {
        roundCount: { increment: 1 },
        totalBet: { increment: totalBet },
        totalWin: { increment: reward },
        cards: { increment: cardIssued },
      },
    });

    // ⑤ L1 + L3 计数
    await updatePosterior(tx, input.machineId, tenantId, input.power, input.landHole);
    await updateBanditArm(tx, input.machineId, tenantId, input.power, hit);

    return { round: created, deduped: false as const, sampleN, modelVersion: created.modelVersion };
  });

  // M4：样本跨 30/50/100 阈值时入队重拟合（不阻塞响应）
  if (!round.deduped) {
    const prev = round.sampleN - 1;
    const crossed = MC_REFIT_THRESHOLDS.some((t) => prev < t && round.sampleN >= t);
    if (crossed) {
      void enqueueMonteCarlo({
        tenantId,
        machineId: input.machineId,
        power: input.power,
        fitVersion: round.modelVersion,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ round: round.round, deduped: round.deduped }, { status: round.deduped ? 200 : 201 });
}
