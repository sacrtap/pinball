import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import { logAudit } from '@/lib/audit';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const InviteSchema = z.object({ email: z.string().email(), role: z.enum(['member', 'owner']).default('member') });

/** POST 邀请成员：生成邀请 token；接受链接由邮件/复制分发 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: '未认证' }, { status: 401 });

  const { id: tenantId } = await params;
  const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  // 仅 owner 可邀请（显式鉴权；RLS 已保证跨团队不可见）
  const membership = await withTenant(session.tenantId!, (tx) =>
    tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: session.tenantId!, userId: session.userId! } },
    }),
  );
  if (!membership || membership.role !== 'owner' || session.tenantId !== tenantId) {
    return NextResponse.json({ error: '仅当前租户 owner 可邀请' }, { status: 403 });
  }

  const token = randomBytes(24).toString('base64url');

  const invitation = await withTenant(tenantId, async (tx) => {
    const inv = await tx.invitation.create({
      data: {
        tenantId,
        email: parsed.data.email,
        role: parsed.data.role,
        token,
        invitedBy: session.userId!,
      },
    });
    await logAudit(tx, tenantId, session.userId!, 'invite', { email: parsed.data.email });
    return inv;
  });

  return NextResponse.json(
    { invitation: { id: invitation.id, token }, acceptUrl: `/invite/accept?token=${token}` },
    { status: 201 },
  );
}
