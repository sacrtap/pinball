import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { getCurrentTenantId } from '@/lib/auth/session';
import { RoundPatchSchema } from '@/lib/schemas';
import { computeCards, computeReward, isHit, litHolesError } from '@/lib/rules';
import type { Multiplier } from '@/lib/types';
import { revertPosterior, updatePosterior } from '@/lib/predict/posterior';
import { revertBanditArm, updateBanditArm } from '@/lib/predict/bandit';
import { logAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/rounds/[id]：编辑历史局。
 * 事务内：回滚旧计数（L1/L3/session 统计）→ 应用新值正向更新 → round.update(edited=true, modelVersion+=1)。
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = await getCurrentTenantId();
  const body = await request.json().catch(() => null);
  const parsed = RoundPatchSchema.safeParse({ ...(body ?? {}), roundId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT', issues: parsed.error.issues }, { status: 400 });
  }
  const patch = parsed.data;

  const result = await withTenant(tenantId, async (tx) => {
    const old = await repo.getRound(tx, id);
    if (!old) throw new Error('ROUND_NOT_FOUND');

    // ① 合并最终值（缺省沿用旧值），并校验亮灯必须量。
    //    位置必须早于任何写操作：先回滚计数再失败会留下半截状态。
    //    RoundPatchSchema 是 partial，跨字段校验只能在这里做。
    const multiplier = patch.multiplier ?? old.multiplier;
    const litHoles = patch.litHoles ?? old.litHoles;
    const litError = litHolesError(multiplier as Multiplier, litHoles);
    if (litError) {
      return { ok: false as const, issues: [{ path: ['litHoles'], message: litError }] };
    }

    // ② 回滚旧计数与统计
    await revertPosterior(tx, old.machineId, tenantId, old.power as never, old.landHole);
    await revertBanditArm(tx, old.machineId, tenantId, old.power as never, old.hit);
    await tx.session.update({
      where: { id: old.sessionId },
      data: {
        roundCount: { decrement: 1 },
        totalBet: { decrement: old.totalBet },
        totalWin: { decrement: old.reward },
        cards: { decrement: old.cardIssued },
      },
    });

    // ③ 应用新值
    const baseBet = patch.baseBet ?? old.baseBet;
    const extraBet = patch.extraBet ?? old.extraBet;
    const power = patch.power ?? old.power;
    const landHole = patch.landHole ?? old.landHole;
    const totalBet = baseBet + extraBet;
    const hit = isHit(landHole, litHoles);
    const reward = computeReward(totalBet, multiplier as never, hit);
    const cardIssued = computeCards(reward);

    // ④ 正向更新
    await updatePosterior(tx, old.machineId, tenantId, power as never, landHole);
    await updateBanditArm(tx, old.machineId, tenantId, power as never, hit);
    const updated = await repo.updateRound(tx, id, {
      multiplier,
      litHoles,
      baseBet,
      extraBet,
      totalBet,
      power,
      landHole,
      hit,
      reward,
      cardIssued,
      recommendedPower: patch.recommendedPower ?? old.recommendedPower,
      recommendMode: patch.recommendMode ?? old.recommendMode,
      edited: true,
      modelVersion: old.modelVersion + 1,
    });

    // ⑤ session 统计正向
    await tx.session.update({
      where: { id: old.sessionId },
      data: {
        roundCount: { increment: 1 },
        totalBet: { increment: totalBet },
        totalWin: { increment: reward },
        cards: { increment: cardIssued },
      },
    });

    await logAudit(tx, tenantId, null, 'round-edit', { roundId: id });

    return { ok: true as const, round: updated };
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'INVALID_INPUT', issues: result.issues }, { status: 400 });
  }

  return NextResponse.json({ round: result.round });
}

/**
 * DELETE /api/rounds/[id]：撤销最后一局。
 * 事务内：反向回滚 L1/L3/session 统计 → round.delete → modelVersion 递增（session 冗余统计先减）。
 */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = await getCurrentTenantId();

  await withTenant(tenantId, async (tx) => {
    const old = await repo.getRound(tx, id);
    if (!old) throw new Error('ROUND_NOT_FOUND');

    // 仅允许撤销最后一局（seq 最大）
    const maxSeq = await tx.round.findFirst({
      where: { sessionId: old.sessionId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    if (maxSeq && maxSeq.seq !== old.seq) {
      throw new Error('NOT_LAST_ROUND');
    }

    await revertPosterior(tx, old.machineId, tenantId, old.power as never, old.landHole);
    await revertBanditArm(tx, old.machineId, tenantId, old.power as never, old.hit);
    await tx.session.update({
      where: { id: old.sessionId },
      data: {
        roundCount: { decrement: 1 },
        totalBet: { decrement: old.totalBet },
        totalWin: { decrement: old.reward },
        cards: { decrement: old.cardIssued },
      },
    });
    await repo.deleteRound(tx, id);
    await logAudit(tx, tenantId, null, 'round-delete', { roundId: id });
  });

  return new NextResponse(null, { status: 204 });
}
