import type { PrismaTransaction } from '@/lib/db/tenant';
import type { PowerLevel } from '@/lib/types';
import { HOLE_COUNT, POWER_LEVELS, DEGRADED_THRESHOLD, THOMPSON_SAMPLES } from '@/lib/rules';
import { alphaVector, dirichletMeanOf, DEFAULT_ALPHA0, type Alpha0Table } from './posterior-common';

/**
 * L3 Thompson 采样上下文老虎机（落库版）。
 * update/revert 在 M2 事务内；recommend 为纯读+采样，可复现（seed=machineId+litHoles）。
 */

export interface RecommendResult {
  thompsonPower: PowerLevel;
  argmaxPower: PowerLevel;
  /** 各档「被采样为最优」的频率，序同 POWER_LEVELS */
  bestArmProb: number[];
  /** bestArmProb[thompson] < 0.55 → 无显著差异 */
  degraded: boolean;
  /** 推荐臂期望返还（θ̂ × totalBet × multiplier） */
  expectedReturn: number;
  /** 推荐臂 12 通道后验分布 */
  channelProb: number[];
  /** 亮灯联合命中概率（推荐臂） */
  litHitProb: number;
  /** 每臂点估计 θ̂ */
  armTheta: number[];
  sampleN: number;
}

/** mulberry32：小巧确定性 PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 32 位种子（FNV-1a） */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Beta 采样（Cheng BB/BC 算法，CPU 近似，无需外部库） */
function sampleBeta(rng: () => number, a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  // 小参数用 Gamma 近似（Johnk）；参数较大时接受轻微偏差
  const x = sampleGamma(rng, a);
  const y = sampleGamma(rng, b);
  const s = x + y;
  return s <= 0 ? a / (a + b) : x / s;
}

/** Gamma(α) 采样（Marsaglia-Tsang，α≥1；α<1 用 boost） */
function sampleGamma(rng: () => number, alpha: number): number {
  let a = alpha;
  let boost = 1;
  if (a < 1) {
    boost = Math.pow(rng(), 1 / a);
    a += 1;
  }
  const d = a - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = 0;
    let v = 0;
    do {
      x = normalQuantileFromRng(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return boost * d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return boost * d * v;
  }
}

/** 标准正态采样（Box-Muller，一对取一个） */
function normalQuantileFromRng(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const SAMPLE_K = THOMPSON_SAMPLES;

/** recommendFromCounts 的单臂输入：该档已知的后验 counts */
export interface ArmCountsInput {
  power: PowerLevel;
  counts: number[];
}

/**
 * 纯函数版推荐：输入已知的每档 counts 数组，跳过 DB 读，
 * 直接跑 Thompson 采样。与 recommend() 同 seed、同采样逻辑、可复现。
 * 供回填脚本滚动重放使用——避免在重放中真的写 Posterior 污染当前统计。
 */
export function recommendFromCounts(
  machineId: string,
  litHoles: number[],
  armsInput: ArmCountsInput[],
  opts: { totalBet?: number; multiplier?: number; alpha0Table?: Alpha0Table } = {},
): RecommendResult {
  const totalBet = opts.totalBet ?? 0;
  // 发力档独立于倍率；期望返还按当前局倍率计
  const multiplier = opts.multiplier ?? 1;
  const alpha0Table = opts.alpha0Table;

  // 按 POWER_LEVELS 固定序组装，缺失档按空 counts（=先验）处理
  const arms = POWER_LEVELS.map((power) => {
    const counts =
      armsInput.find((a) => a.power === power)?.counts ?? new Array<number>(HOLE_COUNT).fill(0);
    const sampleN = counts.reduce((s, x) => s + x, 0);
    const alpha0 = alpha0Table?.[power] ?? DEFAULT_ALPHA0;
    const a = alphaVector(counts, alpha0);
    const litMass = litHoles.reduce((s, h) => s + (a[h - 1] ?? 0), 0);
    const totalMass = a.reduce((s, x) => s + x, 0);
    const theta = totalMass === 0 ? 0 : litMass / totalMass;
    return {
      power,
      counts,
      sampleN,
      litMass,
      nonLitMass: Math.max(totalMass - litMass, 1e-9),
      theta,
    };
  });

  const rng = mulberry32(hashSeed(`${machineId}:${litHoles.join(',')}`));
  const winCounts = new Array<number>(POWER_LEVELS.length).fill(0);
  const thetaSums = new Array<number>(POWER_LEVELS.length).fill(0);

  for (let k = 0; k < SAMPLE_K; k += 1) {
    const samples = arms.map((arm) => {
      // L1 Dirichlet 后验诱导的 Beta：命中=落点∈亮灯，litMass/nonLitMass 已完整刻画。
      // 不再叠加 BanditArm 的 alpha/beta——那是同一命中事件的 Bernoulli 计数，
      // 叠加会重复计数、虚增等效样本数（+banditAB）、收窄置信宽度，使接近档被误判为显著最优。
      // BanditArm 表保留落库，供 calibration/backtest 作独立校验信号，不参与选档采样。
      const alpha = arm.litMass;
      const beta = arm.nonLitMass;
      return { theta: sampleBeta(rng, alpha, beta), draw: rng() };
    });
    let best = 0;
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i].theta > samples[best].theta) best = i;
    }
    winCounts[best] += 1;
    for (let i = 0; i < samples.length; i += 1) thetaSums[i] += samples[i].theta;
  }

  const bestArmProb = winCounts.map((c) => c / SAMPLE_K);
  const sampledTheta = thetaSums.map((s) => s / SAMPLE_K);

  let thompsonIdx = 0;
  for (let i = 1; i < bestArmProb.length; i += 1) {
    if (bestArmProb[i] > bestArmProb[thompsonIdx]) thompsonIdx = i;
  }
  let argmaxIdx = 0;
  for (let i = 1; i < arms.length; i += 1) {
    if (arms[i].theta > arms[argmaxIdx].theta) argmaxIdx = i;
  }

  const thompsonPower = POWER_LEVELS[thompsonIdx];
  const argmaxPower = POWER_LEVELS[argmaxIdx];
  const degraded = bestArmProb[thompsonIdx] < DEGRADED_THRESHOLD;

  const recArm = arms[thompsonIdx];
  const alpha0 = alpha0Table?.[thompsonPower] ?? DEFAULT_ALPHA0;
  const channelProb = dirichletMeanOf(recArm.counts, alpha0);

  return {
    thompsonPower,
    argmaxPower,
    bestArmProb,
    degraded,
    expectedReturn: sampledTheta[thompsonIdx] * totalBet * multiplier,
    channelProb,
    litHitProb: recArm.theta,
    armTheta: arms.map((a) => a.theta),
    sampleN: arms.reduce((s, a) => s + a.sampleN, 0),
  };
}

/**
 * Thompson 采样推荐（落库版）。读三档 Posterior 组装 counts 后委托
 * recommendFromCounts 采样——正式路径与回填共用同一份采样代码，行为严格一致。
 * 每臂诱导 Beta(Σ_{h∈L}α_h, Σ_{h∉L}α_h)，K=2000 次采样统计最优频率。
 */
export async function recommend(
  tx: PrismaTransaction,
  machineId: string,
  tenantId: string,
  litHoles: number[],
  opts: { totalBet?: number; multiplier?: number; alpha0Table?: Alpha0Table } = {},
): Promise<RecommendResult> {
  const armCounts: ArmCountsInput[] = await Promise.all(
    POWER_LEVELS.map(async (power) => {
      const posterior = await tx.posterior.findUnique({
        where: { tenantId_machineId_power: { tenantId, machineId, power } },
      });
      return { power, counts: posterior?.counts ?? new Array<number>(HOLE_COUNT).fill(0) };
    }),
  );
  return recommendFromCounts(machineId, litHoles, armCounts, opts);
}


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
