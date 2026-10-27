import type { PrismaTransaction } from '@/lib/db/tenant';
import type { PowerLevel } from '@/lib/types';

/**
 * L3 Thompson 采样上下文老虎机（落库版）。
 * M2：updateBanditArm/revertBanditArm 的 α/β±1；M3 补齐 recommend 采样。
 */

/** hit → alpha+=1，miss → beta+=1（upsert） */
export async function updateBanditArm(
  tx: PrismaTransaction,
  machineId: string,
  tenantId: string,
  power: PowerLevel,
  hit: boolean,
): Promise<void> {
  const existing = await tx.banditArm.findUnique({
    where: { tenantId_machineId_power: { tenantId, machineId, power } },
  });
  if (!existing) {
    await tx.banditArm.create({
      data: { tenantId, machineId, power, alpha: hit ? 1 : 0, beta: hit ? 0 : 1 },
    });
    return;
  }
  await tx.banditArm.update({
    where: { tenantId_machineId_power: { tenantId, machineId, power } },
    data: { alpha: existing.alpha + (hit ? 1 : 0), beta: existing.beta + (hit ? 0 : 1) },
  });
}

/** 反向回滚（编辑/撤销时） */
export async function revertBanditArm(
  tx: PrismaTransaction,
  machineId: string,
  tenantId: string,
  power: PowerLevel,
  hit: boolean,
): Promise<void> {
  const existing = await tx.banditArm.findUnique({
    where: { tenantId_machineId_power: { tenantId, machineId, power } },
  });
  if (!existing) return;
  await tx.banditArm.update({
    where: { tenantId_machineId_power: { tenantId, machineId, power } },
    data: {
      alpha: Math.max(0, existing.alpha - (hit ? 1 : 0)),
      beta: Math.max(0, existing.beta - (hit ? 0 : 1)),
    },
  });
}
