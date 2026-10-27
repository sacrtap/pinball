import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyOtp } from '@/lib/auth/otp';
import { VerifyOtpSchema } from '@/lib/schemas';

/**
 * POST /api/auth/verify-otp：校验 OTP →
 * 同一 $transaction 建 User + Tenant(个人) + Membership(owner)，失败全回滚。
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = VerifyOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
  const { email, code } = parsed.data;

  if (!(await verifyOtp(email, code))) {
    return NextResponse.json({ error: 'OTP_INVALID' }, { status: 400 });
  }

  // 取注册时暂存的密码哈希
  const pending = await prisma.verificationToken.findFirst({
    where: { identifier: `register:${email}`, expires: { gt: new Date() } },
  });
  if (!pending) {
    return NextResponse.json({ error: 'REGISTRATION_EXPIRED' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.verificationToken.deleteMany({ where: { identifier: `register:${email}` } });
    return NextResponse.json({ verified: true, created: false });
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, passwordHash: pending.token },
    });
    const tenant = await tx.tenant.create({ data: { name: `${email} 的个人空间` } });
    await tx.membership.create({
      data: { tenantId: tenant.id, userId: user.id, role: 'owner' },
    });
    await tx.verificationToken.deleteMany({ where: { identifier: `register:${email}` } });
  });

  return NextResponse.json({ verified: true, created: true });
}
