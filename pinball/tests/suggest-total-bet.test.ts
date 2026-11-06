import { describe, it, expect } from 'vitest';
import { suggestTotalBet, BASE_BET, MAX_EXTRA_BET } from '@/lib/rules';

/**
 * 建议总珠数（θ̂ × 倍率 与 1 比较）：
 * 期望净收益 = 总珠数 × (θ̂ × 倍率 − 1) 对投入线性 → 正期望顶格、非正保底。
 */
describe('suggestTotalBet 建议总珠数', () => {
  it('θ̂×倍率 > 1（正期望）→ 顶格 60', () => {
    expect(suggestTotalBet(0.6, 2)).toBe(60);
    expect(suggestTotalBet(0.3, 4)).toBe(60);
    expect(suggestTotalBet(0.15, 10)).toBe(60);
  });

  it('θ̂×倍率 < 1（非正期望）→ 保底 5', () => {
    expect(suggestTotalBet(0.3, 2)).toBe(5);
    expect(suggestTotalBet(0.1, 10)).toBe(5);
    expect(suggestTotalBet(0, 10)).toBe(5);
  });

  it('θ̂×倍率 = 1（盈亏平衡，非正）→ 保底 5', () => {
    expect(suggestTotalBet(0.5, 2)).toBe(5);
    expect(suggestTotalBet(0.25, 4)).toBe(5);
  });

  it('返回值恒为合法范围端点', () => {
    for (const p of [0, 0.11, 0.5, 0.55, 0.9, 1]) {
      for (const m of [2, 4, 6, 8, 10]) {
        const v = suggestTotalBet(p, m);
        expect([BASE_BET, BASE_BET + MAX_EXTRA_BET]).toContain(v);
      }
    }
  });
});
