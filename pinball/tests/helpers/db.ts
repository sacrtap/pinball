import { prisma } from '@/lib/db/prisma';

/** 测试库清理：按外键序删除全部业务数据 */
export async function cleanDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Round", "Session", "Machine", "Posterior", "SimParams", "BanditArm", "McSimCache",
      "AuditLog", "Membership", "Invitation", "Tenant", "OtpCode", "VerificationToken",
      "Account", "AuthSession", "User", "GlobalPrior"
    RESTART IDENTITY CASCADE;
  `);
}

/** 直接建租户（测试 fixture，不走注册流） */
export async function seedTenant(name: string) {
  return prisma.tenant.create({ data: { name } });
}
