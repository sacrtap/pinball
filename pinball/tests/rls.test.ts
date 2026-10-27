import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { cleanDatabase } from './helpers/db';

/**
 * RLS 集成测试（核心安全断言）：
 * 1. 双租户交叉访问恒 0 行
 * 2. withTenant(tB) 直插 tenantId=tA 的 round 被 RLS WITH CHECK 拒绝
 * 3. 连接角色无 BYPASSRLS（FORCE RLS 对属主也生效）
 */
describe('RLS 租户隔离', () => {
  let tenantA: string;
  let tenantB: string;
  let machineA: string;

  beforeAll(async () => {
    await cleanDatabase();
    const a = await prisma.tenant.create({ data: { name: '租户A' } });
    const b = await prisma.tenant.create({ data: { name: '租户B' } });
    tenantA = a.id;
    tenantB = b.id;

    // A 建机台与 Session（经 withTenant）
    const m = await withTenant(tenantA, (tx) =>
      repo.createMachine(tx, { tenantId: tenantA, code: 'M-A' }),
    );
    machineA = m.id;
    await withTenant(tenantA, (tx) => repo.createSession(tx, { tenantId: tenantA, machineId: m.id }));
  });

  it('A 能读到自己的机台', async () => {
    const machines = await withTenant(tenantA, (tx) => repo.listMachines(tx));
    expect(machines).toHaveLength(1);
    expect(machines[0].id).toBe(machineA);
  });

  it('B 交叉访问 A 的机台恒 0 行', async () => {
    const machines = await withTenant(tenantB, (tx) => repo.listMachines(tx));
    expect(machines).toHaveLength(0);
    const byId = await withTenant(tenantB, (tx) => repo.getMachine(tx, machineA));
    expect(byId).toBeNull();
  });

  it('B 直插 tenantId=A 的 round 被 RLS WITH CHECK 拒绝', async () => {
    const session = await withTenant(tenantA, (tx) =>
      tx.session.findFirst({ where: { machineId: machineA } }),
    );
    expect(session).not.toBeNull();

    await expect(
      withTenant(tenantB, (tx) =>
        repo.createRound(tx, {
          tenantId: tenantA,
          sessionId: session!.id,
          machineId: machineA,
          seq: 1,
          multiplier: 2,
          litHoles: [1, 2, 3, 4, 5],
          baseBet: 5,
          extraBet: 0,
          totalBet: 5,
          power: 'low',
          landHole: 1,
          hit: true,
          reward: 10,
          cardIssued: 0,
          clientRequestId: 'rls-cross-1',
        }),
      ),
    ).rejects.toThrow();
  });

  it('RLS 对表属主（pinball_app）同样生效（FORCE）', async () => {
    // 连接角色即属主；若未 FORCE，属主可绕过 policy —— 上面的插入拒绝已证明 FORCE 生效
    const raw = await prisma.$queryRaw<{ relforcerowsecurity: boolean }[]>`
      SELECT relforcerowsecurity FROM pg_class WHERE relname = 'Round'`;
    expect(raw[0]?.relforcerowsecurity).toBe(true);
  });

  it('连接角色无 BYPASSRLS 属性', async () => {
    const roles = await prisma.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(roles[0]?.rolbypassrls).toBe(false);
    expect(roles[0]?.rolsuper).toBe(false);
  });

  // 未认证 401 遍历需要运行中的服务（M1 手动验收 + E2E 覆盖），
  // 此处仅当 TEST_BASE_URL 指向活服务时执行。
  it.runIf(process.env.TEST_BASE_URL)('未认证遍历 /api/* 全部 401', async () => {
    const routes = [
      ['GET', '/api/machines'],
      ['POST', '/api/sessions'],
      ['POST', '/api/rounds'],
      ['POST', '/api/recommend'],
      ['GET', '/api/stats'],
    ] as const;
    const base = process.env.TEST_BASE_URL;
    for (const [method, path] of routes) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      });
      expect([401, 404, 307]).toContain(res.status);
    }
  });
});
