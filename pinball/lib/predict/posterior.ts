import type { PrismaTransaction } from '@/lib/db/tenant';
import type { PowerLevel } from '@/lib/types';
import { alphaVector, dirichletMeanOf, DEFAULT_ALPHA0 } from './posterior-common';

/**
 * L1 Dirichlet 后验（落库版）。
 * 调用点在录入事务内（round POST 正向 / PATCH·DELETE 反向），保证计数一致。
 * α0 先验强度：L4 池化就绪前恒 1（均匀）；M3.3 后由 priorForMachine 提供。
 */

export { DEFAULT_ALPHA0, alphaVector, dirichletMeanOf as dirichletMean };

/**
 * 命中概率估计 = Σ_{h∈L} α_h / Σ_h α_h。
 * litHoles 缺省返回 0（无亮灯即无命中目标）。
 */
export function estimate(counts: number[], litHoles?: number[], alpha0 = DEFAULT_ALPHA0): number {
  const a = alphaVector(counts, alpha0);
  const total = a.reduce((s, x) => s + x, 0);
  if (!litHoles || litHoles.length === 0) return 0;
  const hit = litHoles.reduce((s, h) => s + (a[h - 1] ?? 0), 0);
  return total === 0 ? 0 : hit / total;
}

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
