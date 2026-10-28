import type { PowerLevel } from '@/lib/types';
import { POWER_LEVELS } from '@/lib/rules';

/**
 * M4.2 评估模块：校准 / 回测 / regret / χ² / 滚动对数似然。
 * 纯函数，输入为 round 记录的投影（避免耦合 Prisma 类型）。
 */

export interface RoundLike {
  power: PowerLevel;
  multiplier: number;
  hit: boolean;
  totalBet: number;
  reward: number;
  litHoles: number[];
  landHole: number;
  recommendedPower?: PowerLevel | null;
  /** one-step-ahead 预测命中概率（录入时暂存；缺省则用经验均值） */
  predictedHitProb?: number | null;
}

/** 预测命中概率分 10 桶 vs 实际命中率 */
export function calibration(rounds: RoundLike[]): { bucket: number; predicted: number; actual: number; n: number }[] {
  const BUCKETS = 10;
  const sums = Array.from({ length: BUCKETS }, () => ({ pred: 0, hit: 0, n: 0 }));
  // 无预测概率时用全局命中率作常数预测（退化校准）
  const globalRate = rounds.length === 0 ? 0 : rounds.filter((r) => r.hit).length / rounds.length;

  for (const r of rounds) {
    const p = r.predictedHitProb ?? globalRate;
    const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor(p * BUCKETS)));
    sums[idx].pred += p;
    sums[idx].hit += r.hit ? 1 : 0;
    sums[idx].n += 1;
  }
  return sums.map((s, i) => ({
    bucket: i,
    predicted: s.n === 0 ? (i + 0.5) / BUCKETS : s.pred / s.n,
    actual: s.n === 0 ? 0 : s.hit / s.n,
    n: s.n,
  }));
}

/**
 * 回测：采纳 recommendedPower 的期望净盈亏 vs 实际执行。
 * 用同档历史命中率作 θ̂ 估计期望返还。
 */
export function backtest(rounds: RoundLike[]): {
  adopted: number;
  actual: number;
  delta: number;
  n: number;
} {
  const theta: Record<string, { hit: number; n: number }> = {};
  for (const r of rounds) {
    const k = `${r.power}:${r.multiplier}`;
    theta[k] ??= { hit: 0, n: 0 };
    theta[k].n += 1;
    if (r.hit) theta[k].hit += 1;
  }
  let adopted = 0;
  let actual = 0;
  let n = 0;
  for (const r of rounds) {
    const rec = r.recommendedPower;
    if (!rec) continue;
    const key = `${rec}:${r.multiplier}`;
    const t = theta[key];
    const rate = t && t.n > 0 ? t.hit / t.n : 0;
    adopted += rate * r.totalBet * r.multiplier - r.totalBet;
    actual += r.reward - r.totalBet;
    n += 1;
  }
  return { adopted, actual, delta: adopted - actual, n };
}

/**
 * Thompson 累计后悔曲线：每局 θ* − θ_实际（θ 为该档×倍率经验命中返还率）。
 */
export function regretCurve(rounds: RoundLike[]): { round: number; regret: number; cumulative: number }[] {
  const theta: Record<string, number> = {};
  let cumulative = 0;
  const out: { round: number; regret: number; cumulative: number }[] = [];
  for (let i = 0; i < rounds.length; i += 1) {
    const r = rounds[i];
    const key = `${r.power}:${r.multiplier}`;
    theta[key] ??= 0;
    // 即时返还率作为 θ 代理
    const rate = r.totalBet === 0 ? 0 : r.reward / r.totalBet;
    let best = 0;
    for (const v of Object.values(theta)) best = Math.max(best, v);
    const regret = Math.max(0, best - rate);
    cumulative += regret;
    theta[key] = rate;
    out.push({ round: i + 1, regret, cumulative });
  }
  return out;
}

/** χ² 拟合优度：Σ (O-E)²/E，返回 {chi2, df, pValue} */
export function chiSquare(observed: number[], expected: number[]): { chi2: number; df: number; pValue: number } {
  let chi2 = 0;
  let df = 0;
  for (let i = 0; i < observed.length; i += 1) {
    const e = expected[i] ?? 0;
    if (e <= 0) continue;
    const o = observed[i] ?? 0;
    chi2 += (o - e) ** 2 / e;
    df += 1;
  }
  return { chi2, df: Math.max(df - 1, 1), pValue: chiSquarePValue(chi2, Math.max(df - 1, 1)) };
}

/** 实测落点分布 vs 均匀（χ² 检验盘面是否偏态） */
export function chiSquareUniform(landHoles: number[], holeCount: number): { chi2: number; df: number; pValue: number } {
  const observed = new Array<number>(holeCount).fill(0);
  for (const h of landHoles) observed[h - 1] += 1;
  const e = landHoles.length / holeCount;
  return chiSquare(observed, new Array<number>(holeCount).fill(e));
}

/** χ² 上尾概率（Wilson-Hilferty 近似） */
function chiSquarePValue(x: number, df: number): number {
  if (x <= 0) return 1;
  const z = (Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - normalCdf(z);
}

function normalCdf(z: number): number {
  // Abramowitz-Stegun 近似
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * poly;
  return z >= 0 ? p : 1 - p;
}

/**
 * L1 vs L2 one-step-ahead 滚动对数似然。
 * L1：经验命中率；L2：用 L2 模拟分布对亮灯通道求和。
 */
export function logLikelihoodRolling(
  rounds: RoundLike[],
  l2Dist: number[] | null,
): { round: number; l1: number; l2: number }[] {
  let hits = 0;
  let n = 0;
  let l1Sum = 0;
  let l2Sum = 0;
  const out: { round: number; l1: number; l2: number }[] = [];
  for (let i = 0; i < rounds.length; i += 1) {
    const r = rounds[i];
    const p1 = n === 0 ? 0.5 : hits / n;
    const l1p = r.hit ? Math.max(p1, 1e-9) : Math.max(1 - p1, 1e-9);
    l1Sum += Math.log(l1p);
    if (l2Dist) {
      const p2 = r.litHoles.reduce((s, h) => s + (l2Dist[h - 1] ?? 0), 0);
      const l2p = r.hit ? Math.max(p2, 1e-9) : Math.max(1 - p2, 1e-9);
      l2Sum += Math.log(l2p);
    }
    n += 1;
    if (r.hit) hits += 1;
    out.push({ round: i + 1, l1: l1Sum, l2: l2Dist ? l2Sum : 0 });
  }
  return out;
}

/** 发力×倍率命中率矩阵 */
export function powerMultiplierMatrix(
  rounds: RoundLike[],
): { power: PowerLevel; multiplier: number; rate: number; n: number }[] {
  const acc = new Map<string, { hit: number; n: number }>();
  for (const r of rounds) {
    const k = `${r.power}:${r.multiplier}`;
    acc.set(k, { hit: (acc.get(k)?.hit ?? 0) + (r.hit ? 1 : 0), n: (acc.get(k)?.n ?? 0) + 1 });
  }
  const out: { power: PowerLevel; multiplier: number; rate: number; n: number }[] = [];
  for (const power of POWER_LEVELS) {
    for (const multiplier of [2, 4, 6, 8, 10] as const) {
      const v = acc.get(`${power}:${multiplier}`);
      out.push({
        power,
        multiplier,
        rate: v && v.n > 0 ? v.hit / v.n : 0,
        n: v?.n ?? 0,
      });
    }
  }
  return out;
}

/**
 * 累计净盈亏曲线（单遍前缀和，O(n)）。
 *
 * 数值语义与旧实现（slice(0, i+1).reduce((s, x) => s + x.reward - x.totalBet, 0)）
 * 逐点严格相等：每步必须是「acc 先加 reward 再减 totalBet」——写成
 * `acc += reward - totalBet` 会先算括号内再累加，浮点下与旧实现不等
 * （实测 96.19 vs 96.19000000000001）。保持中间步骤一致，仅省掉重复累加。
 */
export function pnlTrend(rounds: RoundLike[]): { round: number; pnl: number }[] {
  let acc = 0;
  return rounds.map((r, i) => {
    acc = acc + r.reward - r.totalBet;
    return { round: i + 1, pnl: acc };
  });
}
