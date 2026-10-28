import type { PrismaTransaction } from '@/lib/db/tenant';
import { aggPrisma } from '@/lib/db/agg-client';
import type { PowerLevel } from '@/lib/types';
import { HOLE_COUNT, POWER_LEVELS, PRIOR_STRENGTH } from '@/lib/rules';
import { DEFAULT_ALPHA0, type Alpha0Table } from './posterior-common';

/**
 * L4 层次贝叶斯部分池化。
 * 跨租户匿名聚合 (power, hole) 计数 → GlobalPrior；
 * 新档位 posterior 以 α0 = PRIOR_STRENGTH × P̄_power 初始化，
 * 随样本增长权重 n/(n+15) 自动滑向机台个性。
 */

/** 机台匿名化标识（无 userId、不可反查） */
function machineAlias(machineId: string): string {
  // 简化哈希：FNV-1a → base36
  let h = 0x811c9dc5;
  for (let i = 0; i < machineId.length; i += 1) {
    h ^= machineId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `m${(h >>> 0).toString(36)}`;
}

export interface GlobalPriorRow {
  power: PowerLevel;
  counts: number[];
  sampleN: number;
  /** 归一化全局分布 P̄ */
  dist: number[];
}

/**
 * 跨租户汇总匿名 (power, hole) 计数 → GlobalPrior 表。
 * 排除 contributeAnonymous=false 的租户（按 User 级开关，
 * 租户内任一 owner 关闭即排除该租户全部数据）；machineId 不明文落库。
 */
export async function aggregateGlobalPrior(): Promise<GlobalPriorRow[]> {
  // 跨租户聚合必须绕过 RLS：用 BYPASSRLS 的聚合角色独立连接。
  // tx 参数保留仅为调用点兼容，不参与查询。
  const rows = await aggPrisma.$queryRaw<
    { power: string; hole: number; n: bigint }[]
  >`
    SELECT p.power AS "power",
           g.hole AS "hole",
           SUM(g.c)::bigint AS n
    FROM "Posterior" p
    CROSS JOIN LATERAL unnest(p.counts) WITH ORDINALITY AS g(c, hole)
    WHERE g.c > 0
      AND NOT EXISTS (
        SELECT 1 FROM "Membership" m
        JOIN "User" u ON u.id = m."userId"
        WHERE m."tenantId" = p."tenantId" AND u."contributeAnonymous" = false
      )
    GROUP BY p.power, g.hole
  `;

  const byPower = new Map<PowerLevel, number[]>();
  for (const level of POWER_LEVELS) byPower.set(level, new Array<number>(HOLE_COUNT).fill(0));
  for (const r of rows) {
    const power = r.power as PowerLevel;
    const arr = byPower.get(power);
    if (!arr) continue;
    const idx = Number(r.hole) - 1;
    if (idx >= 0 && idx < HOLE_COUNT) arr[idx] += Number(r.n);
  }

  const result: GlobalPriorRow[] = [];
  for (const level of POWER_LEVELS) {
    const counts = byPower.get(level)!;
    const sampleN = counts.reduce((s, x) => s + x, 0);
    const dist =
      sampleN === 0
        ? new Array<number>(HOLE_COUNT).fill(1 / HOLE_COUNT)
        : counts.map((x) => x / sampleN);
    result.push({ power: level, counts, sampleN, dist });
    await aggPrisma.globalPrior.upsert({
      where: { power: level },
      create: { power: level, counts, sampleN },
      update: { counts, sampleN },
    });
  }
  return result;
}

/** 全局归一化分布 P̄_power（无数据时均匀） */
export function priorDist(row: GlobalPriorRow | undefined): number[] {
  if (!row || row.sampleN === 0) return new Array<number>(HOLE_COUNT).fill(1 / HOLE_COUNT);
  return row.counts.map((x) => x / row.sampleN);
}

/** α0 = PRIOR_STRENGTH × P̄_power（逐洞先验强度） */
export function alpha0FromPrior(row: GlobalPriorRow | undefined): number[] {
  const dist = priorDist(row);
  return dist.map((p) => p * PRIOR_STRENGTH);
}

/** 每档标量 α0（无池化数据时 DEFAULT_ALPHA0）——给 recommend 的 Alpha0Table */
export function alpha0TableFrom(rows: GlobalPriorRow[]): Alpha0Table {
  const table: Alpha0Table = {};
  for (const row of rows) {
    const dist = priorDist(row);
    const total = dist.reduce((s, x) => s + x, 0);
    table[row.power] = total === 0 ? DEFAULT_ALPHA0 : (total * PRIOR_STRENGTH) / HOLE_COUNT;
  }
  return table;
}

/**
 * 新档位 posterior 初始化为全局先验（α0 强度）。
 * sampleN 增长时机台个性权重 n/(n+PRIOR_STRENGTH) 自动上升。
 */
export async function initPosteriorWithPrior(
  tx: PrismaTransaction,
  machineId: string,
  tenantId: string,
  power: PowerLevel,
  priorRow?: GlobalPriorRow,
): Promise<void> {
  const existing = await tx.posterior.findUnique({
    where: { tenantId_machineId_power: { tenantId, machineId, power } },
  });
  if (existing) return;
  const counts = priorRow
    ? priorRow.counts.map((c) => Math.round((c / Math.max(priorRow.sampleN, 1)) * PRIOR_STRENGTH))
    : new Array<number>(HOLE_COUNT).fill(0);
  await tx.posterior.create({ data: { tenantId, machineId, power, counts } });
}


/** 导出匿名化机台别名（供审计/调试，不含明文 machineId） */
export { machineAlias };
