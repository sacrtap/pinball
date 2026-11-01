'use client';

import { create } from 'zustand';
import type { Multiplier, PowerLevel } from '@/lib/types';

export type EntryStep = 0 | 1 | 2;

export interface EntryState {
  step: EntryStep;
  multiplier: Multiplier | null;
  litHoles: number[];
  extraBet: number;
  power: PowerLevel | null;
  landHole: number | null;
  /** 服务端返回的推荐（亮灯选满后拉取） */
  recommendation: null | {
    thompsonPower: PowerLevel;
    argmaxPower: PowerLevel;
    bestArmProb: [number, number, number];
    degraded: boolean;
    channelProb: number[];
    /** 亮灯通道联合命中概率 */
    litHitProb: number;
  };
  setStep: (s: EntryStep) => void;
  setMultiplier: (m: Multiplier) => void;
  /** max 为该倍率下的亮灯上限（1..max 都合法） */
  toggleLitHole: (hole: number, max: number) => void;
  setExtraBet: (n: number) => void;
  setPower: (p: PowerLevel) => void;
  setLandHole: (h: number | null) => void;
  setRecommendation: (r: EntryState['recommendation']) => void;
  reset: () => void;
}

const INITIAL = {
  step: 0 as EntryStep,
  multiplier: null,
  litHoles: [] as number[],
  extraBet: 0,
  power: null,
  landHole: null,
  recommendation: null,
};

export const useEntryStore = create<EntryState>((set) => ({
  ...INITIAL,
  setStep: (step) => set({ step }),
  setMultiplier: (multiplier) => set({ multiplier, litHoles: [], recommendation: null }),
  /**
   * 亮灯通道选择：`max` 是上限，不是必须量——该倍率下 1..max 个都合法。
   * 已选中的可取消；未达上限时追加；达上限后忽略（UI 侧已把未选项禁用，不会静默）。
   * 亮灯集合变化会作废已拉取的推荐，避免 step1 展示与当前选择不符的概率。
   */
  toggleLitHole: (hole, max) =>
    set((s) => {
      if (max <= 0) return {};
      if (s.litHoles.includes(hole)) {
        return { litHoles: s.litHoles.filter((h) => h !== hole), recommendation: null };
      }
      if (s.litHoles.length >= max) return {};
      return { litHoles: [...s.litHoles, hole], recommendation: null };
    }),
  setExtraBet: (extraBet) => set({ extraBet }),
  setPower: (power) => set({ power }),
  setLandHole: (landHole) => set({ landHole }),
  setRecommendation: (recommendation) => set({ recommendation }),
  // 软重置：连续录入沿用上局倍率（换倍率时 setMultiplier 会清亮灯，必重选）
  reset: () =>
    set({
      step: 0,
      litHoles: [],
      extraBet: 0,
      power: null,
      landHole: null,
      recommendation: null,
    }),
}));
