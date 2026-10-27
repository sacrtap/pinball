import type { Machine, Round, Session } from '@prisma/client';
import type { PrismaTransaction } from '@/lib/db/tenant';

/**
 * 租户绑定仓储。所有函数第一参为 tx（来自 withTenant），
 * 不接裸 tenantId 查询；RLS 在数据库层二次强制隔离。
 */

// ---------------------------------------------------------------- Machine

export async function createMachine(
  tx: PrismaTransaction,
  data: { tenantId: string; code: string; name?: string | null; venue?: string | null; holeCount?: number; holeNumbering?: string },
): Promise<Machine> {
  return tx.machine.create({ data });
}

export async function updateMachine(
  tx: PrismaTransaction,
  id: string,
  data: Partial<Pick<Machine, 'code' | 'name' | 'venue' | 'holeCount' | 'holeNumbering'>>,
): Promise<Machine> {
  return tx.machine.update({ where: { id }, data });
}

export async function listMachines(tx: PrismaTransaction): Promise<Machine[]> {
  return tx.machine.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getMachine(tx: PrismaTransaction, id: string): Promise<Machine | null> {
  return tx.machine.findUnique({ where: { id } });
}

/** 删除机台（schema onDelete: Cascade 级联 Session/Round/Posterior/SimParams/BanditArm/McSimCache） */
export async function deleteMachine(tx: PrismaTransaction, id: string): Promise<Machine> {
  return tx.machine.delete({ where: { id } });
}

// ---------------------------------------------------------------- Session

export async function createSession(
  tx: PrismaTransaction,
  data: { tenantId: string; machineId: string },
): Promise<Session> {
  return tx.session.create({ data: { ...data, status: 'active' } });
}

export async function listSessions(
  tx: PrismaTransaction,
  machineId?: string,
): Promise<Session[]> {
  return tx.session.findMany({
    where: machineId ? { machineId } : undefined,
    orderBy: { startedAt: 'desc' },
  });
}

export async function getSession(
  tx: PrismaTransaction,
  id: string,
): Promise<Session | null> {
  return tx.session.findUnique({ where: { id } });
}

export async function closeSession(tx: PrismaTransaction, id: string): Promise<Session> {
  return tx.session.update({
    where: { id },
    data: { status: 'closed', endedAt: new Date() },
  });
}

// ---------------------------------------------------------------- Round

export async function createRound(
  tx: PrismaTransaction,
  data: Record<string, unknown>,
): Promise<Round> {
  return tx.round.create({ data: data as never });
}

export async function getRound(tx: PrismaTransaction, id: string): Promise<Round | null> {
  return tx.round.findUnique({ where: { id } });
}

/** 幂等查询：命中 (tenantId, sessionId, clientRequestId) 唯一键 */
export async function findRoundByIdempotencyKey(
  tx: PrismaTransaction,
  tenantId: string,
  sessionId: string,
  clientRequestId: string,
): Promise<Round | null> {
  return tx.round.findUnique({
    where: { tenantId_sessionId_clientRequestId: { tenantId, sessionId, clientRequestId } },
  });
}

export async function listRounds(
  tx: PrismaTransaction,
  sessionId: string,
  opts: { take?: number; skip?: number } = {},
): Promise<Round[]> {
  return tx.round.findMany({
    where: { sessionId },
    orderBy: { seq: 'asc' },
    take: opts.take,
    skip: opts.skip,
  });
}

export async function listRoundsByMachine(
  tx: PrismaTransaction,
  machineId: string,
): Promise<Round[]> {
  return tx.round.findMany({
    where: { machineId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateRound(
  tx: PrismaTransaction,
  id: string,
  data: Record<string, unknown>,
): Promise<Round> {
  return tx.round.update({ where: { id }, data: data as never });
}

export async function deleteRound(tx: PrismaTransaction, id: string): Promise<Round> {
  return tx.round.delete({ where: { id } });
}

export async function countRoundsBySession(
  tx: PrismaTransaction,
  sessionId: string,
): Promise<number> {
  return tx.round.count({ where: { sessionId } });
}
