import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';

export const dynamic = 'force-dynamic';

/**
 * /session/[id] 兼容入口：录入交互在 /play 子路由，此处校验 session 归属后
 * 重定向过去，避免用户直接输入或从旧书签打开时撞 404。
 */
export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.tenantId) redirect('/login');

  const exists = await withTenant(session.tenantId, (tx) => repo.getSession(tx, id));
  if (!exists) notFound();

  redirect(`/session/${id}/play`);
}
