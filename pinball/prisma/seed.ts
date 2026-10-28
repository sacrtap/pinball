import { prisma } from '../lib/db/prisma';
import { withTenant } from '../lib/db/tenant';
import { hashPassword } from '../lib/auth/password';

/**
 * 开发/测试 seed：建测试租户（含 owner 用户 + 机台 + 一个 Session）。
 * pnpm prisma db seed 执行。业务写入经 withTenant（RLS 要求 app.current_tenant）。
 */
async function main() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Round", "Session", "Machine", "Posterior", "SimParams", "BanditArm", "McSimCache",
      "AuditLog", "Membership", "Invitation", "Tenant", "OtpCode", "VerificationToken",
      "Account", "AuthSession", "User", "GlobalPrior"
    RESTART IDENTITY CASCADE;
  `);

  const passwordHash = await hashPassword('dev-password-123');

  // User/Tenant/Membership 无 RLS，直连建；Machine/Session 走 withTenant
  const user = await prisma.user.create({
    data: { email: 'dev@pinball.local', passwordHash },
  });
  const tenant = await prisma.tenant.create({ data: { name: '开发租户' } });
  await prisma.membership.create({
    data: { tenantId: tenant.id, userId: user.id, role: 'owner' },
  });

  const machine = await withTenant(tenant.id, (tx) =>
    tx.machine.create({
      data: { tenantId: tenant.id, code: 'DEV-001', name: '开发机台', holeCount: 12 },
    }),
  );
  await withTenant(tenant.id, (tx) =>
    tx.session.create({ data: { tenantId: tenant.id, machineId: machine.id, status: 'active' } }),
  );

  console.log(`seed done: user=${user.email} tenant=${tenant.id} machine=${machine.code}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
