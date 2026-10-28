import type { PowerLevel } from '@/lib/types';
import { HOLE_COUNT } from '@/lib/rules';
import { mulberry32, hashSeed } from './bandit';

/**
 * L2 蒙特卡洛高尔顿板。
 * 盘面：HOLE_COUNT 行钉，每钉以概率 pegBias 向右偏（Bernoulli）；
 * 总右偏次数 ~ Binomial(rows, pegBias) 决定基础落列，
 * 发力档位经 (entryOffset, spread) 平移缩放后取最近通道。
 */

export interface SimParams {
  pegBias: number;
  entryOffset: number;
  spread: number;
}

const POWER_ORDER: PowerLevel[] = ['low', 'mid', 'high'];

export const DEFAULT_PARAMS: Record<PowerLevel, SimParams> = {
  low: { pegBias: 0.5, entryOffset: -1.5, spread: 0.9 },
  mid: { pegBias: 0.5, entryOffset: 0, spread: 1 },
  high: { pegBias: 0.5, entryOffset: 1.5, spread: 1.1 },
};

export interface SimResult {
  /** 12 通道经验概率 */
  dist: number[];
  /** 蒙特卡洛标准误 √(p̂(1-p̂)/N) */
  stderr: number[];
  n: number;
}

/** 单次弹道：12 行钉的右偏总和 */
function bounce(rng: () => number, rows: number, pegBias: number): number {
  let right = 0;
  for (let i = 0; i < rows; i += 1) {
    if (rng() < pegBias) right += 1;
  }
  return right;
}

/**
 * 模拟 N 次弹道 → 落点分布 + 标准误。
 * seed 决定结果（同 seed 严格相等）。
 */
export function simulate(
  params: SimParams,
  power: PowerLevel,
  n: number,
  seed: string,
): SimResult {
  const rng = mulberry32(hashSeed(seed));
  const counts = new Array<number>(HOLE_COUNT).fill(0);
  const rows = HOLE_COUNT;
  const baseCenter = (rows - 1) / 2;

  for (let i = 0; i < n; i += 1) {
    const right = bounce(rng, rows, params.pegBias);
    const col = baseCenter + (right - baseCenter) * params.spread + params.entryOffset;
    const hole = Math.min(HOLE_COUNT, Math.max(1, Math.round(col) + 1));
    counts[hole - 1] += 1;
  }

  const dist = counts.map((c) => c / n);
  const stderr = dist.map((p) => Math.sqrt(Math.max(p * (1 - p), 0) / n));
  return { dist, stderr, n };
}

/** KL(实测 ‖ 模拟)，加 ε 防 log 0 */
export function klDivergence(observed: number[], expected: number[]): number {
  const eps = 1e-9;
  let kl = 0;
  for (let i = 0; i < observed.length; i += 1) {
    const p = Math.max(observed[i] ?? 0, eps);
    const q = Math.max(expected[i] ?? 0, eps);
    kl += p * Math.log(p / q);
  }
  return kl;
}

export interface FitSample {
  landHole: number;
  power: PowerLevel;
}

/**
 * 网格搜索拟合：最小化 KL(实测 ‖ 模拟)。
 * 样本 < 30 或数据退化 → 全局均值参数（不拟合）。
 */
export function fit(samples: FitSample[], seedKey = 'fit'): SimParams[] {
  if (samples.length < 30) {
    return POWER_ORDER.map((p) => DEFAULT_PARAMS[p]);
  }
  return POWER_ORDER.map((power) => {
    const holes = samples.filter((s) => s.power === power).map((s) => s.landHole);
    if (holes.length < 10) return DEFAULT_PARAMS[power];

    const observed = new Array<number>(HOLE_COUNT).fill(0);
    for (const h of holes) observed[Math.min(HOLE_COUNT, Math.max(1, h)) - 1] += 1;
    const observedDist = observed.map((c) => c / holes.length);

    let best: SimParams = DEFAULT_PARAMS[power];
    let bestKl = Number.POSITIVE_INFINITY;
    // 粗网格（PLAN：p step .01 × offset step .5 × spread step .05）
    for (let p = 0.3; p <= 0.7001; p += 0.01) {
      for (let off = -2; off <= 2.0001; off += 0.5) {
        for (let sp = 0.8; sp <= 1.3001; sp += 0.05) {
          const params = { pegBias: p, entryOffset: off, spread: sp };
          const sim = simulate(params, power, Math.max(2000, holes.length * 20), `${seedKey}:${power}`);
          const kl = klDivergence(observedDist, sim.dist);
          if (kl < bestKl) {
            bestKl = kl;
            best = params;
          }
        }
      }
    }
    return best;
  });
}

/** 理论二项分布（钉板右偏概率 p 时的落列分布），用于直方图叠加 */
export function binomialReference(pegBias: number, spread: number, entryOffset: number): number[] {
  const rows = HOLE_COUNT;
  const baseCenter = (rows - 1) / 2;
  // 二项概率质量
  const binom = new Array<number>(rows + 1).fill(0);
  for (let k = 0; k <= rows; k += 1) {
    binom[k] = binomPmf(k, rows, pegBias);
  }
  const dist = new Array<number>(HOLE_COUNT).fill(0);
  for (let k = 0; k <= rows; k += 1) {
    const col = baseCenter + (k - baseCenter) * spread + entryOffset;
    const hole = Math.min(HOLE_COUNT, Math.max(1, Math.round(col) + 1));
    dist[hole - 1] += binom[k];
  }
  return dist;
}

function binomPmf(k: number, n: number, p: number): number {
  const logC =
    logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
  return Math.exp(logC + k * Math.log(Math.max(p, 1e-12)) + (n - k) * Math.log(Math.max(1 - p, 1e-12)));
}

function logGamma(x: number): number {
  // Lanczos 近似
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
