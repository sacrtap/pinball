import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { cleanDatabase } from './helpers/db';

/**
 * PATCH /api/rounds/[id] 的亮灯数量校验（区间 1..LIT_COUNT[multiplier]）：
 * RoundPatchSchema 是 partial，跨字段校验只能在路由内做。
 * 修复前该路由直接落库 patch.litHoles，可写入任意长度亮灯数组。
 *
 * 认证以 mock 的 getCurrentTenantId 提供（只验证校验与落库，不验鉴权）。
 */

const state = vi.hoisted(() => ({ tenantId: '' }));

vi.mock('@/lib/auth/session', () => ({
  getCurrentTenantId: async () => state.tenantId,
  getCurrentUserId: async () => null,
}));

import { POST } from '@/app/api/rounds/route';
import { PATCH } from '@/app/api/rounds/[id]/route';

describe('PATCH /api/rounds/[id] 亮灯数量校验', () => {
  let tenantId: string;
  let machineId: string;
  let sessionId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const tenant = await prisma.tenant.create({ data: { name: '编辑校验测试租户' } });
    tenantId = tenant.id;
    state.tenantId = tenantId;
    const machine = await withTenant(tenantId, (tx) =>
      repo.createMachine(tx, { tenantId, code: 'PL-1' }),
    );
    machineId = machine.id;
    const session = await withTenant(tenantId, (tx) =>
      repo.createSession(tx, { tenantId, machineId }),
    );
    sessionId = session.id;
  });

  beforeEach(() => {
    state.tenantId = tenantId;
  });

  /** 走完整录入链路建局（含 posterior/bandit/session 统计），返回 id。 */
  async function postRound(over: Record<string, unknown> = {}) {
    const res = await POST(
      new Request('http://localhost/api/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          machineId,
          multiplier: 4,
          litHoles: [1, 2, 3, 4],
          baseBet: 5,
          extraBet: 0,
          power: 'mid',
          landHole: 2,
          clientRequestId: crypto.randomUUID(),
          ...over,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { round: { id: string } };
    return json.round.id;
  }

  async function patchRound(id: string, body: Record<string, unknown>) {
    const res = await PATCH(
      new Request(`http://localhost/api/rounds/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );
    return { status: res.status, json: (await res.json()) as { error?: string; issues?: unknown } };
  }

  function readRound(id: string) {
    return withTenant(tenantId, (tx) => repo.getRound(tx, id));
  }

  function readSession() {
    return withTenant(tenantId, (tx) => repo.getSession(tx, sessionId));
  }

  it('亮灯数超过倍率上限 → 400 且局数据与 session 统计不变', async () => {
    const id = await postRound({ multiplier: 4, litHoles: [1, 2, 3, 4] });
    const before = await readSession();

    const { status, json } = await patchRound(id, { litHoles: [1, 2, 3, 4, 5] });

    expect(status).toBe(400);
    expect(json.error).toBe('INVALID_INPUT');
    const row = await readRound(id);
    expect(row!.litHoles).toEqual([1, 2, 3, 4]);
    expect(row!.edited).toBe(false);
    expect(await readSession()).toEqual(before);
  });

  it('亮灯数为 0 → 400（每个倍率至少 1 个）', async () => {
    const id = await postRound();
    const { status } = await patchRound(id, { litHoles: [] });
    expect(status).toBe(400);
  });

  it('只改倍率导致旧亮灯数超新上限 → 400', async () => {
    const id = await postRound({ multiplier: 4, litHoles: [1, 2, 3, 4] });
    const { status, json } = await patchRound(id, { multiplier: 10 });
    expect(status).toBe(400);
    expect(json.error).toBe('INVALID_INPUT');
    expect((await readRound(id))!.multiplier).toBe(4);
  });

  it('改成上限更宽的倍率且不改亮灯 → 200（4 个亮灯在 2× 上限 5 之内）', async () => {
    const id = await postRound({ multiplier: 4, litHoles: [1, 2, 3, 4] });
    const { status } = await patchRound(id, { multiplier: 2 });
    expect(status).toBe(200);
    expect((await readRound(id))!.multiplier).toBe(2);
  });

  it('重复亮灯通道 → 400', async () => {
    const id = await postRound();
    const { status } = await patchRound(id, { litHoles: [1, 1, 2, 3] });
    expect(status).toBe(400);
  });

  it('未选满但 ≥1 个 → 200，重算命中与奖励', async () => {
    const id = await postRound({ multiplier: 4, litHoles: [1, 2, 3, 4], landHole: 2 });
    const { status } = await patchRound(id, { multiplier: 10, litHoles: [3], landHole: 3 });

    expect(status).toBe(200);
    const row = await readRound(id);
    expect(row!.multiplier).toBe(10);
    expect(row!.litHoles).toEqual([3]);
    expect(row!.hit).toBe(true);
    expect(row!.reward).toBe(row!.totalBet * 10);
    expect(row!.edited).toBe(true);
  });
});
