import { prisma } from '@/lib/db/prisma';

/** OTP TTL：10 分钟 */
const OTP_TTL_MS = 10 * 60 * 1000;

/** 6 位数字 OTP */
export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function storeOtp(email: string, code: string): Promise<void> {
  // 同邮箱旧 code 全部作废，只保留最新一枚
  await prisma.otpCode.updateMany({
    where: { email, consumed: false },
    data: { consumed: true },
  });
  await prisma.otpCode.create({
    data: { email, code, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
}

/** 校验并消费 OTP（一次性） */
export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const record = await prisma.otpCode.findFirst({
    where: { email, code, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return false;
  await prisma.otpCode.update({ where: { id: record.id }, data: { consumed: true } });
  return true;
}
