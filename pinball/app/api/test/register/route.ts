import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';

/**
 * 测试专用：直接建已验证账号（跳过 OTP 邮件流）。
 * 仅当 ENABLE_TEST_ROUTES=true 时可用（.env 开发配置开启，生产不设即禁）；
 * OTP 主链路由 tests/auth.test.ts 覆盖。
 */
export async function POST(request: Request) {
  if (process.env.ENABLE_TEST_ROUTES !== 'true') {
    return NextResponse.json({ error: 'NOT_AVAILABLE' }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!email || password.length < 8) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ created: false });

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash } });
    const tenant = await tx.tenant.create({ data: { name: `${email} 的空间` } });
    await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'owner' } });
  });
  return NextResponse.json({ created: true });
}
