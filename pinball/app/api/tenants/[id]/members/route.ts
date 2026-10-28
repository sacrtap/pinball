import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import { logAudit } from '@/lib/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({ userId: z.string().uuid(), role: z.enum(['member', 'owner']) });

/** GET 成员列表 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: '未认证' }, { status: 401 });
  const { id: tenantId } = await params;

  const members = await withTenant(tenantId, (tx) =>
    tx.membership.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, email: true, createdAt: true } } },
    }),
  );

  return NextResponse.json({
    members: members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      role: m.role,
      joinedAt: m.user.createdAt,
    })),
  });
}

/** PATCH 改角色（仅 owner） */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: '未认证' }, { status: 401 });
  const { id: tenantId } = await params;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  const caller = await withTenant(tenantId, (tx) =>
    tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: session.userId! } } }),
  );
  if (!caller || caller.role !== 'owner') {
    return NextResponse.json({ error: '仅 owner 可改角色' }, { status: 403 });
  }
  // 不能自降级（防止租户无 owner）
  if (parsed.data.userId === session.userId && parsed.data.role !== 'owner') {
    return NextResponse.json({ error: '不能自降级' }, { status: 400 });
  }

  await withTenant(tenantId, async (tx) => {
    await tx.membership.update({
      where: { tenantId_userId: { tenantId, userId: parsed.data.userId } },
      data: { role: parsed.data.role },
    });
    await logAudit(tx, tenantId, session.userId!, 'member-role', { userId: parsed.data.userId, role: parsed.data.role });
  });

  return NextResponse.json({ ok: true });
}

/** DELETE 移除成员（仅 owner；不能移除自己） */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: '未认证' }, { status: 401 });
  const { id: tenantId } = await params;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 });
  if (userId === session.userId) {
    return NextResponse.json({ error: '不能移除自己' }, { status: 400 });
  }

  const caller = await withTenant(tenantId, (tx) =>
    tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: session.userId! } } }),
  );
  if (!caller || caller.role !== 'owner') {
    return NextResponse.json({ error: '仅 owner 可移除成员' }, { status: 403 });
  }

  await withTenant(tenantId, async (tx) => {
    await tx.membership.deleteMany({ where: { tenantId, userId } });
    await logAudit(tx, tenantId, session.userId!, 'member-remove', { userId });
  });

  return NextResponse.json({ ok: true });
}
