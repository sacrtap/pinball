import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { generateOtp, storeOtp, verifyOtp } from '@/lib/auth/otp';
import { getTenantIdForUser } from '@/lib/auth/tenant-resolve';
import { cleanDatabase } from './helpers/db';

/**
 * 认证集成测试：
 * - 注册 → OTP（console 模式读日志拿 code）→ 验证 → 同事务建 User+Tenant+Membership
 * - 重复邮箱注册失败
 * - 密码 Argon2id 校验
 */
describe('认证', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  it('密码哈希为 Argon2id 且可校验', async () => {
    const hash = await hashPassword('super-secret-123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'super-secret-123')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('OTP：6 位数字，可验证且一次性', async () => {
    const email = 'otp-test@example.com';
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
    await storeOtp(email, code);
    expect(await verifyOtp(email, code)).toBe(true);
    // 一次性：第二次失败
    expect(await verifyOtp(email, code)).toBe(false);
    // 错误 code 失败
    await storeOtp(email, '654321');
    expect(await verifyOtp(email, '000000')).toBe(false);
  });

  it('注册→OTP→建 User+Tenant+Membership 同事务成功', async () => {
    const email = 'register-flow@example.com';
    const password = 'super-secret-123';
    const passwordHash = await hashPassword(password);

    // 1) 注册：暂存哈希 + 发 OTP
    const code = generateOtp();
    await storeOtp(email, code);
    await prisma.verificationToken.deleteMany({ where: { identifier: `register:${email}` } });
    await prisma.verificationToken.create({
      data: { identifier: `register:${email}`, token: passwordHash, expires: new Date(Date.now() + 1800_000) },
    });

    // 2) 验证 OTP + 同事务建号建租户
    expect(await verifyOtp(email, code)).toBe(true);
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash } });
      const tenant = await tx.tenant.create({ data: { name: `${email} 的个人空间` } });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'owner' } });
      await tx.verificationToken.deleteMany({ where: { identifier: `register:${email}` } });
    });

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    const tenantId = await getTenantIdForUser(user!.id);
    expect(tenantId).toBeTruthy();

    const memberships = await prisma.membership.findMany({ where: { userId: user!.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('owner');

    // 3) 密码可校验
    expect(await verifyPassword(user!.passwordHash!, password)).toBe(true);
  });

  it('重复邮箱注册失败（唯一约束）', async () => {
    const email = 'dup@example.com';
    await prisma.user.create({ data: { email, passwordHash: await hashPassword('password-one') } });
    await expect(
      prisma.user.create({ data: { email, passwordHash: await hashPassword('password-two') } }),
    ).rejects.toThrow();
  });
});
