import { auth } from '@/lib/auth/config';

/** 服务端取当前租户：从 JWT 读 tenantId，无则抛 401 */
export async function getCurrentTenantId(): Promise<string> {
  const session = await auth();
  if (!session?.tenantId) throw new Error('UNAUTHORIZED: no tenant');
  return session.tenantId;
}

/** 当前用户 id，无则 null */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.userId ?? null;
}
