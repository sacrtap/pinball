import type { PrismaTransaction } from '@/lib/db/tenant';

/** 审计动作类型（与 AuditLog.action 对齐） */
export type AuditAction =
  | 'login'
  | 'logout'
  | 'export'
  | 'account-delete'
  | 'round-edit'
  | 'round-delete'
  | 'invite'
  | 'member-role'
  | 'member-remove'
  | 'tenant-create'
  | 'tenant-switch';

/**
 * 写审计日志（在业务事务内调用，与业务变更同生共死）。
 * detail 为结构化 JSON（字符串原样存）。
 */
export async function logAudit(
  tx: PrismaTransaction,
  tenantId: string,
  userId: string | null,
  action: AuditAction,
  detail?: Record<string, unknown>,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      detail: detail ? (detail as object) : undefined,
    },
  });
}
