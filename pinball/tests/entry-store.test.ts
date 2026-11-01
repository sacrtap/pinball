import { describe, it, expect, beforeEach } from 'vitest';
import { useEntryStore } from '@/lib/stores/entry-store';
import { LIT_COUNT, MULTIPLIERS } from '@/lib/rules';

/**
 * 亮灯通道「上限」语义：
 * 每个倍率下可选 1..N 个（N 由倍率决定），未选满也合法；
 * 达到上限后新增被忽略（UI 侧同时把未选项置灰，不构成静默失败）。
 */
const store = () => useEntryStore.getState();

describe('亮灯通道上限语义', () => {
  beforeEach(() => {
    useEntryStore.setState({
      step: 0,
      multiplier: null,
      litHoles: [],
      extraBet: 0,
      power: null,
      landHole: null,
      recommendation: null,
    });
  });

  it('未达上限时按点击顺序追加', () => {
    store().toggleLitHole(3, 5);
    store().toggleLitHole(7, 5);
    expect(store().litHoles).toEqual([3, 7]);
  });

  it('达到上限后新增被忽略，长度不再增长', () => {
    for (const hole of [1, 2, 3, 4, 5]) store().toggleLitHole(hole, 5);
    store().toggleLitHole(6, 5);
    expect(store().litHoles).toEqual([1, 2, 3, 4, 5]);
  });

  it('点击已选洞位取消，取消后可继续补选', () => {
    for (const hole of [1, 2, 3]) store().toggleLitHole(hole, 3);
    store().toggleLitHole(2, 3);
    expect(store().litHoles).toEqual([1, 3]);
    store().toggleLitHole(9, 3);
    expect(store().litHoles).toEqual([1, 3, 9]);
  });

  it('重复点击同一未选洞位不产生重复项', () => {
    store().toggleLitHole(4, 5);
    store().toggleLitHole(4, 5);
    expect(store().litHoles).toEqual([]);
  });

  it('倍率未选（max=0）时任何点击都不改变选择', () => {
    store().toggleLitHole(1, 0);
    expect(store().litHoles).toEqual([]);
  });

  it('各倍率下长度恒不超过上限，且 1 个即构成有效选择', () => {
    for (const multiplier of MULTIPLIERS) {
      useEntryStore.setState({ multiplier, litHoles: [] });
      const max = LIT_COUNT[multiplier];
      for (let hole = 1; hole <= 12; hole += 1) {
        store().toggleLitHole(hole, max);
        expect(store().litHoles.length).toBeLessThanOrEqual(max);
        expect(new Set(store().litHoles).size).toBe(store().litHoles.length);
      }
      expect(store().litHoles).toHaveLength(max);
    }
  });

  it('切换倍率清空已选亮灯与推荐', () => {
    useEntryStore.setState({
      multiplier: 2,
      litHoles: [1, 2, 3, 4, 5],
      recommendation: {
        thompsonPower: 'mid',
        argmaxPower: 'mid',
        bestArmProb: [0.2, 0.6, 0.2],
        degraded: false,
        channelProb: [],
        litHitProb: 0.5,
      },
    });
    store().setMultiplier(10);
    expect(store().litHoles).toEqual([]);
    expect(store().recommendation).toBeNull();
  });

  it('亮灯集合变化使已拉取的推荐失效', () => {
    const rec = {
      thompsonPower: 'mid' as const,
      argmaxPower: 'mid' as const,
      bestArmProb: [0.2, 0.6, 0.2] as [number, number, number],
      degraded: false,
      channelProb: [] as number[],
      litHitProb: 0.5,
    };
    store().toggleLitHole(1, 5);
    store().setRecommendation(rec);
    store().toggleLitHole(2, 5);
    expect(store().recommendation).toBeNull();
  });
});
