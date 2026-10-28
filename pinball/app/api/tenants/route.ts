import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({ name: z.string().min(1).max(64) });

/** GET 我的租户列表（含角色） */
export async function GET() {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: '未认证' }, { status: 401 });

  const memberships = await prisma.membership.findMany({
    where: { userId: session.userId },
    include: { tenant: { select: { id: true, name: true, createdAt: true } } },
    orderBy: { tenant: { createdAt: 'asc' } },
  });

  return NextResponse.json({
    tenants: memberships.map((m) => ({
      id: m.tenant.id,
      name: m.tenant.name,
      role: m.role,
      createdAt: m.tenant.createdAt,
      current: m.tenantId === session.tenantId,
    })),
  });
}

/** POST 建团队租户（当前用户为 owner） */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: '未认证' }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  const tenant = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({ data: { name: parsed.data.name } });
    await tx.membership.create({
      data: { tenantId: t.id, userId: session.userId!, role: 'owner' },
    });
    return t;
  });

  return NextResponse.json({ tenant }, { status: 201 });
}
