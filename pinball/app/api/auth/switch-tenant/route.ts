import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ tenantId: z.string().uuid() });

/** POST 切换当前租户：刷新 JWT 的 tenantId */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: '未认证' }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  // 必须是该用户的成员
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: parsed.data.tenantId, userId: session.userId } },
  });
  if (!membership) return NextResponse.json({ error: '无权访问该租户' }, { status: 403 });

  // JWT 在下次请求时经 jwt 回调重签（lib/auth/config 的 trigger === 'update' 路径）
  // 此处用 signIn 回调不可行，直接返回由客户端调用 update() 触发 session 更新
  return NextResponse.json({ ok: true, tenantId: parsed.data.tenantId });
}
