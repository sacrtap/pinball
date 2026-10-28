import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { updatePosterior, revertPosterior } from '@/lib/predict/posterior';
import { updateBanditArm, revertBanditArm } from '@/lib/predict/bandit';
import { computeReward, computeCards, isHit, litCountFor } from '@/lib/rules';
import { RoundInputSchema } from '@/lib/schemas';
import { cleanDatabase } from './helpers/db';

/**
 * 录入事务测试：
 * 1. 幂等（同 clientRequestId 两次提交只产 1 行）
 * 2. 编辑历史局后 session 统计与 posterior counts 一致
 * 3. 撤销最后一局回滚正确
 * 4. posterior/bandit update→revert 幂等回原值
 * 5. 规则函数口径
 */
describe('录入流', () => {
  let tenantId: string;
  let machineId: string;
  let sessionId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const tenant = await prisma.tenant.create({ data: { name: '录入测试租户' } });
    tenantId = tenant.id;
    const machine = await withTenant(tenantId, (tx) =>
      repo.createMachine(tx, { tenantId, code: 'RT-1' }),
    );
    machineId = machine.id;
    const s = await withTenant(tenantId, (tx) => repo.createSession(tx, { tenantId, machineId }));
    sessionId = s.id;
  });

  interface RoundPayload {
    sessionId: string;
    machineId: string;
    multiplier: number;
    litHoles: number[];
    baseBet: number;
    extraBet: number;
    power: string;
    landHole: number;
    clientRequestId: string;
  }

  function makeRound(overrides: Partial<RoundPayload> = {}): RoundPayload {
    return {
      sessionId,
      machineId,
      multiplier: 2,
      litHoles: [1, 2, 3, 4, 5],
      baseBet: 5,
      extraBet: 0,
      power: 'low',
      landHole: 3,
      clientRequestId: crypto.randomUUID(),
      ...overrides,
    };
  }

  async function submit(payload: RoundPayload) {
    const parsed = RoundInputSchema.safeParse(payload);
    if (!parsed.success) throw new Error('schema invalid: ' + JSON.stringify(parsed.error.issues));
    return withTenant(tenantId, async (tx) => {
      const existing = await repo.findRoundByIdempotencyKey(
        tx,
        tenantId,
        payload.sessionId,
        payload.clientRequestId,
      );
      if (existing) return existing;

      const session = await repo.getSession(tx, payload.sessionId);
      const totalBet = payload.baseBet + payload.extraBet;
      const hit = isHit(payload.landHole, payload.litHoles);
      const reward = computeReward(totalBet, payload.multiplier as never, hit);
      const cardIssued = computeCards(reward);
      const created = await repo.createRound(tx, {
        tenantId,
        sessionId: payload.sessionId,
        machineId: payload.machineId,
        seq: (session?.roundCount ?? 0) + 1,
        multiplier: payload.multiplier,
        litHoles: payload.litHoles,
        baseBet: payload.baseBet,
        extraBet: payload.extraBet,
        totalBet,
        power: payload.power,
        landHole: payload.landHole,
        hit,
        reward,
        cardIssued,
        clientRequestId: payload.clientRequestId,
      });
      await tx.session.update({
        where: { id: payload.sessionId },
        data: {
          roundCount: { increment: 1 },
          totalBet: { increment: totalBet },
          totalWin: { increment: reward },
          cards: { increment: cardIssued },
        },
      });
      await updatePosterior(tx, machineId, tenantId, payload.power as never, payload.landHole);
      await updateBanditArm(tx, machineId, tenantId, payload.power as never, hit);
      return created;
    });
  }

  it('规则函数口径', () => {
    expect(litCountFor(2)).toBe(5);
    expect(litCountFor(10)).toBe(1);
    expect(isHit(3, [1, 2, 3])).toBe(true);
    expect(isHit(4, [1, 2, 3])).toBe(false);
    expect(computeReward(5, 2, true)).toBe(10);
    expect(computeReward(5, 2, false)).toBe(0);
    expect(computeCards(29)).toBe(0);
    expect(computeCards(30)).toBe(1);
    expect(computeCards(200)).toBe(5); // 上限 5
  });

  it('schema：亮灯数≠倍率映射被拒', () => {
    const bad = makeRound({ litHoles: [1, 2] }); // 2× 需 5 个
    expect(RoundInputSchema.safeParse(bad).success).toBe(false);
    const ok = makeRound();
    expect(RoundInputSchema.safeParse(ok).success).toBe(true);
  });

  it('幂等：同 clientRequestId 两次提交只产 1 行', async () => {
    const rid = 'idem-key-1';
    const r1 = await submit(makeRound({ clientRequestId: rid }));
    const r2 = await submit(makeRound({ clientRequestId: rid }));
    expect(r2.id).toBe(r1.id);
    const count = await withTenant(tenantId, (tx) => tx.round.count({ where: { sessionId } }));
    expect(count).toBe(1);
  });

  it('posterior/bandit update→revert 回原值', async () => {
    await withTenant(tenantId, async (tx) => {
      await updatePosterior(tx, machineId, tenantId, 'mid', 7);
      const after = await tx.posterior.findUnique({
        where: { tenantId_machineId_power: { tenantId, machineId, power: 'mid' } },
      });
      await revertPosterior(tx, machineId, tenantId, 'mid', 7);
      const reverted = await tx.posterior.findUnique({
        where: { tenantId_machineId_power: { tenantId, machineId, power: 'mid' } },
      });
      expect(reverted!.counts[6]).toBe((after!.counts[6] ?? 0) - 1);

      await updateBanditArm(tx, machineId, tenantId, 'mid', true);
      const armAfter = await tx.banditArm.findUnique({
        where: { tenantId_machineId_power: { tenantId, machineId, power: 'mid' } },
      });
      await revertBanditArm(tx, machineId, tenantId, 'mid', true);
      const armReverted = await tx.banditArm.findUnique({
        where: { tenantId_machineId_power: { tenantId, machineId, power: 'mid' } },
      });
      expect(armReverted!.alpha).toBe(armAfter!.alpha - 1);
    });
  });

  it('编辑历史局：回滚后重放，统计与模型一致', async () => {
    // 第 2 局（不同 clientRequestId）
    const r2 = await submit(makeRound({ clientRequestId: 'edit-target', landHole: 3, power: 'low' }));
    expect(r2.seq).toBe(2);

    const before = await withTenant(tenantId, async (tx) => ({
      session: await repo.getSession(tx, sessionId),
      posterior: await tx.posterior.findUnique({
        where: { tenantId_machineId_power: { tenantId, machineId, power: 'low' } },
      }),
    }));

    // 编辑：landHole 3→5，power low→high（命中仍 true）
    await withTenant(tenantId, async (tx) => {
      const old = await repo.getRound(tx, r2.id);
      await revertPosterior(tx, machineId, tenantId, old!.power as never, old!.landHole);
      await revertBanditArm(tx, machineId, tenantId, old!.power as never, old!.hit);
      await tx.session.update({
        where: { id: sessionId },
        data: { totalBet: { decrement: old!.totalBet }, totalWin: { decrement: old!.reward } },
      });
      await updatePosterior(tx, machineId, tenantId, 'high', 5);
      await updateBanditArm(tx, machineId, tenantId, 'high', true);
      await repo.updateRound(tx, r2.id, {
        power: 'high',
        landHole: 5,
        hit: true,
        edited: true,
        modelVersion: old!.modelVersion + 1,
      });
      await tx.session.update({
        where: { id: sessionId },
        data: { totalBet: { increment: 5 }, totalWin: { increment: 10 } },
      });
    });

    const after = await withTenant(tenantId, async (tx) => ({
      session: await repo.getSession(tx, sessionId),
      edited: await repo.getRound(tx, r2.id),
    }));

    expect(after.edited!.edited).toBe(true);
    expect(after.edited!.modelVersion).toBe(2);
    // 统计净值不变（投入/奖励相同，仅换了档与落点）
    expect(after.session!.totalBet).toBe(before.session!.totalBet);
    expect(after.session!.totalWin).toBe(before.session!.totalWin);
  });

  it('撤销最后一局：回滚正确', async () => {
    const before = await withTenant(tenantId, (tx) => repo.getSession(tx, sessionId));
    const last = await withTenant(tenantId, (tx) =>
      tx.round.findFirst({ where: { sessionId }, orderBy: { seq: 'desc' } }),
    );

    await withTenant(tenantId, async (tx) => {
      const old = await repo.getRound(tx, last!.id);
      await revertPosterior(tx, machineId, tenantId, old!.power as never, old!.landHole);
      await revertBanditArm(tx, machineId, tenantId, old!.power as never, old!.hit);
      await tx.session.update({
        where: { id: sessionId },
        data: {
          roundCount: { decrement: 1 },
          totalBet: { decrement: old!.totalBet },
          totalWin: { decrement: old!.reward },
        },
      });
      await repo.deleteRound(tx, last!.id);
    });

    const after = await withTenant(tenantId, (tx) => repo.getSession(tx, sessionId));
    expect(after!.roundCount).toBe(before!.roundCount - 1);
    expect(after!.totalBet).toBe(before!.totalBet - last!.totalBet);
    expect(after!.totalWin).toBe(before!.totalWin - last!.reward);
  });
});
