import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { RoundInputSchema } from '@/lib/schemas';
import { cleanDatabase } from './helpers/db';

/**
 * POST /api/rounds 推荐链路透传：
 * 录入时提交的 recommendedPower / recommendMode / predictedHitProb 必须落库，
 * 这是「推荐回测」「模型校准」两个统计区块的数据前提（此前写入入口漏填，
 * 导致回测 n 恒为 0、校准退化为常数）。
 *
 * 认证以 mock 的 getCurrentTenantId 提供（本用例只验证字段透传，不验鉴权）。
 */

const state = vi.hoisted(() => ({ tenantId: '' }));

vi.mock('@/lib/auth/session', () => ({
  getCurrentTenantId: async () => state.tenantId,
  getCurrentUserId: async () => null,
}));

import { POST } from '@/app/api/rounds/route';

describe('rounds POST 推荐字段透传', () => {
  let tenantId: string;
  let machineId: string;
  let sessionId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const tenant = await prisma.tenant.create({ data: { name: '透传测试租户' } });
    tenantId = tenant.id;
    state.tenantId = tenantId;
    const machine = await withTenant(tenantId, (tx) => repo.createMachine(tx, { tenantId, code: 'PT-1' }));
    machineId = machine.id;
    const session = await withTenant(tenantId, (tx) => repo.createSession(tx, { tenantId, machineId }));
    sessionId = session.id;
  });

  beforeEach(() => {
    state.tenantId = tenantId;
  });

  function payload(over: Record<string, unknown> = {}) {
    return {
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
    };
  }

  async function postRound(body: Record<string, unknown>) {
    const res = await POST(
      new Request('http://localhost/api/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as { round?: { id: string }; error?: string } };
  }

  async function readRound(id: string) {
    return withTenant(tenantId, (tx) => repo.getRound(tx, id));
  }

  it('带三字段提交 → DB 三字段均非空且取值一致', async () => {
    const body = payload({
      recommendedPower: 'high',
      recommendMode: 'thompson',
      predictedHitProb: 0.42,
    });
    // 前置：schema 接受这三字段（optional，本就不阻塞旧客户端）
    expect(RoundInputSchema.safeParse(body).success).toBe(true);

    const { status, json } = await postRound(body);
    expect(status).toBe(201);
    const row = await readRound(json.round!.id);

    expect(row!.recommendedPower).toBe('high');
    expect(row!.recommendMode).toBe('thompson');
    expect(row!.predictedHitProb).toBeCloseTo(0.42, 10);
  });

  it('降级期记录 recommendMode=prior 也落库', async () => {
    const { status, json } = await postRound(
      payload({ recommendedPower: 'low', recommendMode: 'prior', predictedHitProb: 0.05 }),
    );
    expect(status).toBe(201);
    const row = await readRound(json.round!.id);
    expect(row!.recommendMode).toBe('prior');
    expect(row!.recommendedPower).toBe('low');
    expect(row!.predictedHitProb).toBeCloseTo(0.05, 10);
  });

  it('不带三字段提交 → DB 全部为 null（旧客户端/无推荐场景）', async () => {
    const { status, json } = await postRound(payload());
    expect(status).toBe(201);
    const row = await readRound(json.round!.id);
    expect(row!.recommendedPower).toBeNull();
    expect(row!.recommendMode).toBeNull();
    expect(row!.predictedHitProb).toBeNull();
  });

  it('显式 null 提交 → DB 为 null（不写成 0，避免污染校准分桶）', async () => {
    const { status, json } = await postRound(
      payload({ recommendedPower: null, recommendMode: null, predictedHitProb: null }),
    );
    expect(status).toBe(201);
    const row = await readRound(json.round!.id);
    expect(row!.recommendedPower).toBeNull();
    expect(row!.recommendMode).toBeNull();
    expect(row!.predictedHitProb).toBeNull();
  });

  it('predictedHitProb 超出 [0,1] 被 schema 拒绝（400）', async () => {
    const bad = await postRound(payload({ predictedHitProb: 1.5 }));
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('INVALID_INPUT');
  });

  it('幂等重放：同 clientRequestId 不双写，且保留首次的推荐快照', async () => {
    const clientRequestId = 'predict-fields-idem';
    const first = await postRound(
      payload({ clientRequestId, recommendedPower: 'high', recommendMode: 'thompson', predictedHitProb: 0.3 }),
    );
    const second = await postRound(payload({ clientRequestId }));

    expect(second.status).toBe(200);
    expect(second.json.round!.id).toBe(first.json.round!.id);
    const row = await readRound(first.json.round!.id);
    expect(row!.recommendedPower).toBe('high');
    expect(row!.predictedHitProb).toBeCloseTo(0.3, 10);
  });
});
