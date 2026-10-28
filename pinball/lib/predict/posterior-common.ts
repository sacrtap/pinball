import { HOLE_COUNT } from '@/lib/rules';
import type { PowerLevel } from '@/lib/types';

/**
 * L1/L3/L4 共享的 α 先验工具。
 * 独立模块避免 posterior ↔ bandit 循环依赖。
 */

/** 默认先验强度（均匀） */
export const DEFAULT_ALPHA0 = 1;

/** L4 池化提供的每档先验强度（α0 per power） */
export type Alpha0Table = Partial<Record<PowerLevel, number>>;

/** counts + α0 的完整 α 向量（长度 HOLE_COUNT） */
export function alphaVector(counts: number[], alpha0 = DEFAULT_ALPHA0): number[] {
  const a = new Array<number>(HOLE_COUNT).fill(alpha0);
  for (let h = 0; h < HOLE_COUNT; h += 1) a[h] += counts[h] ?? 0;
  return a;
}

/** Dirichlet 后验均值（归一化，长度 HOLE_COUNT） */
export function dirichletMeanOf(counts: number[], alpha0 = DEFAULT_ALPHA0): number[] {
  const a = alphaVector(counts, alpha0);
  const total = a.reduce((s, x) => s + x, 0);
  if (total === 0) return new Array<number>(HOLE_COUNT).fill(1 / HOLE_COUNT);
  return a.map((x) => x / total);
}
