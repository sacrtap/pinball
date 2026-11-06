/**
 * 业务规则常量与纯函数 —— 全栈单一来源。
 * 严禁在组件/路由内重复字面量；规则变更只改此处。
 */

/** 物理洞口数（PRD §1.1：图像分析纠正为 12） */
export const HOLE_COUNT = 12;

/** 倍率池 */
export const MULTIPLIERS = [2, 4, 6, 8, 10] as const;

/** 倍率 → 亮灯通道数映射（2×:5 / 4×:4 / 6×:3 / 8×:2 / 10×:1） */
export const LIT_COUNT: Record<Multiplier, number> = {
  2: 5,
  4: 4,
  6: 3,
  8: 2,
  10: 1,
};

/** 默认投入（基础珠数） */
export const BASE_BET = 5;

/** 解锁推荐的样本门槛（局数） */
export const SAMPLE_THRESHOLD = 10;

/** 单局奖励达到该珠数出 1 张积分卡 */
export const CARD_THRESHOLD = 30;

/** 积分卡持有上限 */
export const CARD_MAX = 5;

/** 发力档位 */
export const POWER_LEVELS = ['low', 'mid', 'high'] as const;

/** 加注上限：本局总珠数上限 60（基础 5 + 加注 55） */
export const MAX_EXTRA_BET = 55;

/** L3 Thompson 采样的 degraded 判定阈值 */
export const DEGRADED_THRESHOLD = 0.55;

/** L3 采样次数 */
export const THOMPSON_SAMPLES = 2000;

/** L4 先验强度：α0 = 15 × P̄ */
export const PRIOR_STRENGTH = 15;

/** L2 蒙特卡洛模拟次数 */
export const MC_SIM_N = 10_000;

/** L2 触发重拟合的样本阈值 */
export const MC_REFIT_THRESHOLDS = [30, 50, 100] as const;

import type { Multiplier } from '@/lib/types';

/** 亮灯通道数 */
export function litCountFor(multiplier: Multiplier): number {
  return LIT_COUNT[multiplier];
}

/** 是否命中：落点在亮灯通道集合内 */
export function isHit(landHole: number, litHoles: number[]): boolean {
  return litHoles.includes(landHole);
}

/** 奖励 = 投入 × 倍率（未命中为 0） */
export function computeReward(totalBet: number, multiplier: Multiplier, hit: boolean): number {
  return hit ? totalBet * multiplier : 0;
}

/** 积分卡 = floor(reward / 30)，上限 5 */
export function computeCards(reward: number): number {
  return Math.min(CARD_MAX, Math.floor(reward / CARD_THRESHOLD));
}

/** 默认加注 */
export const DEFAULT_EXTRA_BET = 0;

/** 校验洞口编号合法（1..12） */
export function isValidHole(hole: number): boolean {
  return Number.isInteger(hole) && hole >= 1 && hole <= HOLE_COUNT;
}

/**
 * 亮灯通道数量校验：合法返回 null，否则返回中文错误消息。
 *
 * 数量是区间 `[1, LIT_COUNT[multiplier]]`：每个倍率至少 1 个、最多 N 个，
 * 未选满也合法（不必凑满）——上限不是「必须量」。录入 schema 与编辑接口共用。
 */
export function litHolesError(multiplier: Multiplier, litHoles: number[]): string | null {
  const max = litCountFor(multiplier);
  if (litHoles.length < 1) return '至少选择 1 个亮灯通道';
  if (litHoles.length > max) {
    return `倍率 ${multiplier} 最多 ${max} 个亮灯通道，收到 ${litHoles.length}`;
  }
  if (new Set(litHoles).size !== litHoles.length) return '亮灯通道不可重复';
  if (!litHoles.every(isValidHole)) return `亮灯通道须为 1..${HOLE_COUNT} 的整数`;
  return null;
}
