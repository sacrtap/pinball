import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 数据层唯一入口：事务内设置 app.current_tenant（true = 事务本地，
 * 连接池/PgBouncer transaction 模式下复用连接也不会串租户），
 * 业务函数在 fn 内执行；RLS policy 在数据库层二次强制隔离。
 *
 * 严禁任何仓储函数绕过本函数直连 prisma 查询业务表。
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: PrismaTransaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return fn(tx as unknown as PrismaTransaction);
  });
}

/** 供 service 层引用的事务类型别名 */
export type Tx = PrismaTransaction;

/** Prisma 交互事务客户端（嵌套事务场景） */
export type InteractiveTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
