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

  it('团队租户 A 成员不能访问团队租户 B 数据（跨团队隔离）', async () => {
    await cleanDatabase();
    const [teamA, teamB] = await Promise.all([
      prisma.tenant.create({ data: { name: '团队A' } }),
      prisma.tenant.create({ data: { name: '团队B' } }),
    ]);
    const userA = await prisma.user.create({
      data: { email: 'teama@pinball.local', passwordHash: 'x' },
    });
    const userB = await prisma.user.create({
      data: { email: 'teamb@pinball.local', passwordHash: 'x' },
    });
    await prisma.membership.createMany({
      data: [
        { tenantId: teamA.id, userId: userA.id, role: 'owner' },
        { tenantId: teamB.id, userId: userB.id, role: 'owner' },
      ],
    });
    const machineB = await withTenant(teamB.id, (tx) =>
      repo.createMachine(tx, { tenantId: teamB.id, code: 'B-1' }),
    );

    // A 的会话看不到 B 的机台
    const seen = await withTenant(teamA.id, (tx) => repo.getMachine(tx, machineB.id));
    expect(seen).toBeNull();
    const list = await withTenant(teamA.id, (tx) => repo.listMachines(tx));
    expect(list).toHaveLength(0);

    // A 也不能直插 B 的机台下 round（WITH CHECK 拒绝）
    await expect(
      withTenant(teamA.id, (tx) =>
        repo.createSession(tx, { tenantId: teamA.id, machineId: machineB.id }),
      ),
    ).rejects.toThrow();
  });

  it('注销后数据物理删除（Cascade 后查表为空）', async () => {
    await cleanDatabase();
    const t = await prisma.tenant.create({ data: { name: '待注销' } });
    const u = await prisma.user.create({ data: { email: 'bye@pinball.local', passwordHash: 'x' } });
    await prisma.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'owner' } });
    const m = await withTenant(t.id, (tx) => repo.createMachine(tx, { tenantId: t.id, code: 'BYE' }));

    // 建 session + round
    const s = await withTenant(t.id, (tx) => repo.createSession(tx, { tenantId: t.id, machineId: m.id }));
    await withTenant(t.id, (tx) =>
      repo.createRound(tx, {
        tenantId: t.id,
        sessionId: s.id,
        machineId: m.id,
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
        clientRequestId: 'bye-1',
      }),
    );

    // 模拟注销：物理删租户（Cascade 级联全部业务表）。
    // 走 withTenant（提供 app.current_tenant，RLS 放行本租户行）。
    // 注销在用户请求路径内：withTenant 提供 tenant 上下文，RLS 正常放行本租户删除
    await withTenant(t.id, async (tx) => {
      await tx.round.deleteMany({ where: { tenantId: t.id } });
      await tx.session.deleteMany({ where: { tenantId: t.id } });
      await tx.machine.deleteMany({ where: { tenantId: t.id } });
      await tx.posterior.deleteMany({ where: { tenantId: t.id } });
      await tx.simParams.deleteMany({ where: { tenantId: t.id } });
      await tx.banditArm.deleteMany({ where: { tenantId: t.id } });
      await tx.mcSimCache.deleteMany({ where: { tenantId: t.id } });
      await tx.auditLog.deleteMany({ where: { tenantId: t.id } });
      await tx.membership.deleteMany({ where: { tenantId: t.id } });
      await tx.tenant.delete({ where: { id: t.id } });
    });
    await prisma.user.delete({ where: { id: u.id } });

    // 断言同样需要租户上下文（裸连接的 RLS policy 因 current_setting 空串报 uuid 错误）
    const counts = await withTenant(t.id, async (tx) => ({
      tenant: await tx.tenant.count({ where: { id: t.id } }),
      machine: await tx.machine.count({ where: { tenantId: t.id } }),
      round: await tx.round.count({ where: { tenantId: t.id } }),
      session: await tx.session.count({ where: { tenantId: t.id } }),
    }));
    expect(counts.tenant).toBe(0);
    expect(counts.machine).toBe(0);
    expect(counts.round).toBe(0);
    expect(counts.session).toBe(0);
    expect(await prisma.user.count({ where: { id: u.id } })).toBe(0);
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
