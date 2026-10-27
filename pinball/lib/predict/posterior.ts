import type { PrismaTransaction } from '@/lib/db/tenant';
import type { PowerLevel } from '@/lib/types';

/**
 * L1 Dirichlet 后验（落库版）。
 * M2：update/revert 的 counts±1；M3 补齐 estimate/dirichletMean 与 α0 先验。
 * 调用点在录入事务内（round POST 正向 / PATCH·DELETE 反向），保证计数一致。
 */

/** counts[hole-1] += 1（upsert） */
export async function updatePosterior(
  tx: PrismaTransaction,
  machineId: string,
  tenantId: string,
  power: PowerLevel,
  hole: number,
): Promise<void> {
  const existing = await tx.posterior.findUnique({
    where: { tenantId_machineId_power: { tenantId, machineId, power } },
  });
  if (!existing) {
    const counts = new Array(12).fill(0);
    counts[hole - 1] += 1;
    await tx.posterior.create({ data: { tenantId, machineId, power, counts } });
    return;
  }
  const counts = [...existing.counts];
  counts[hole - 1] = (counts[hole - 1] ?? 0) + 1;
  await tx.posterior.update({
    where: { tenantId_machineId_power: { tenantId, machineId, power } },
    data: { counts },
  });
}

/** counts[hole-1] -= 1（下限 0，防 revert 过度） */
export async function revertPosterior(
  tx: PrismaTransaction,
  machineId: string,
  tenantId: string,
  power: PowerLevel,
  hole: number,
): Promise<void> {
  const existing = await tx.posterior.findUnique({
    where: { tenantId_machineId_power: { tenantId, machineId, power } },
  });
  if (!existing) return;
  const counts = [...existing.counts];
  counts[hole - 1] = Math.max(0, (counts[hole - 1] ?? 0) - 1);
  await tx.posterior.update({
    where: { tenantId_machineId_power: { tenantId, machineId, power } },
    data: { counts },
  });
}
