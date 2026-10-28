import { PrismaClient } from '@prisma/client';

/**
 * L4 全局先验聚合专用客户端（BYPASSRLS 角色）。
 * 仅用于跨租户读 Posterior / 写 GlobalPrior 的定时聚合 job，
 * 严禁任何请求路径使用本客户端。
 *
 * 连接串由 AGG_DATABASE_URL 提供；未配置时回落到 pinball_agg 默认凭据。
 */
function aggUrl(): string {
  if (process.env.AGG_DATABASE_URL) return process.env.AGG_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? '';
  // 将 user:password 与 host/db 保留，仅替换凭据
  return base.replace(/\/\/[^@]*@/, '//pinball_agg:pinball_agg_dev@');
}

export const aggPrisma = new PrismaClient({
  datasources: { db: { url: aggUrl() } },
});
