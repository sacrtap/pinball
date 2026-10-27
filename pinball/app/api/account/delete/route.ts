import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db/prisma';
import { withTenant } from '@/lib/db/tenant';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ confirm: z.literal('DELETE') });

/** DELETE 注销账号：物理删租户数据（Cascade）+ 删 user */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.userId || !session.tenantId) {
    return NextResponse.json({ error: '未认证' }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '需确认字段 confirm="DELETE"' }, { status: 400 });
  }

  const tenantId = session.tenantId;
  const userId = session.userId;

  // 删除前先写独立留存审计（租户删后 AuditLog 随 Cascade 消失）
  await withTenant(tenantId, (tx) =>
    tx.auditLog.create({
      data: { tenantId, userId, action: 'account-delete', detail: { at: new Date().toISOString() } },
    }),
  );

  // 业务表删除必须在 withTenant 内（裸连接未设 app.current_tenant，
  // RLS policy 的 current_setting 返空串会使 uuid 解析失败）。
  // User 表无 RLS，可在事务外删。
  await withTenant(tenantId, async (tx) => {
    await tx.round.deleteMany({ where: { tenantId } });
    await tx.session.deleteMany({ where: { tenantId } });
    await tx.machine.deleteMany({ where: { tenantId } });
    await tx.posterior.deleteMany({ where: { tenantId } });
    await tx.simParams.deleteMany({ where: { tenantId } });
    await tx.banditArm.deleteMany({ where: { tenantId } });
    await tx.mcSimCache.deleteMany({ where: { tenantId } });
    await tx.auditLog.deleteMany({ where: { tenantId } });
    await tx.invitation.deleteMany({ where: { tenantId } });
    await tx.membership.deleteMany({ where: { tenantId } });
    await tx.tenant.delete({ where: { id: tenantId } });
  });
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
