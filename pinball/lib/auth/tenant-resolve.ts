import { prisma } from '@/lib/db/prisma';

/**
 * 用户 → 默认租户解析（个人租户）。
 * signIn/jwt 回调调用，写入 token.tenantId；未来团队切换时刷新 JWT。
 */
export async function getTenantIdForUser(userId: string): Promise<string | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId, role: 'owner' },
    orderBy: { tenant: { createdAt: 'asc' } },
    select: { tenantId: true },
  });
  return membership?.tenantId ?? null;
}
