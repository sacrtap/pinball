import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { generateOtp, storeOtp } from '@/lib/auth/otp';
import { sendOtpEmail } from '@/lib/auth/email';
import { RegisterSchema } from '@/lib/schemas';

/** POST /api/auth/register：邮箱+密码 → 发 OTP（建 User 推迟到验证后，与建租户同事务） */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT', issues: parsed.error.issues }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'EMAIL_TAKEN' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const code = generateOtp();
  await storeOtp(email, code);
  await sendOtpEmail(email, code);

  // 密码哈希暂存 OTP 记录旁路：验证通过时用同一密码建号，
  // 避免未验证邮箱落库。这里通过 detail 字段携带（仅服务端可见）。
  await prisma.verificationToken.deleteMany({ where: { identifier: `register:${email}` } });
  await prisma.verificationToken.create({
    data: {
      identifier: `register:${email}`,
      token: passwordHash,
      expires: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  return NextResponse.json({ otpSent: true });
}
