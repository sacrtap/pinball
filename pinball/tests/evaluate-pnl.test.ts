import { describe, it, expect } from 'vitest';
import { pnlTrend, type RoundLike } from '@/lib/predict/evaluate';
import { hashSeed, mulberry32 } from '@/lib/predict/bandit';

/**
 * pnlTrend 前缀和对拍：新实现（O(n) 单遍）必须与旧实现
 * （slice(0, i+1).reduce 逐步累加）逐点严格相等。
 * 这是统计页性能重构不改变数值语义的证伪测试。
 */

function makeRounds(n: number, seed: string): RoundLike[] {
  const rng = mulberry32(hashSeed(seed));
  return Array.from({ length: n }, (_, i) => ({
    power: (['low', 'mid', 'high'] as const)[i % 3],
    multiplier: [2, 4, 6, 8, 10][i % 5],
    hit: rng() < 0.4,
    // 整数投入 + 小数奖金：覆盖整数与浮点混合累加顺序
    totalBet: 50 + (i % 7) * 10,
    reward: Math.round(rng() * 300 * 100) / 100,
    litHoles: [],
    landHole: (i % 12) + 1,
  }));
}

/** 旧实现的字面复刻（对拍基准，勿「顺手优化」） */
function legacyPnlTrend(rounds: RoundLike[]): { round: number; pnl: number }[] {
  return rounds.map((r, i) => ({
    round: i + 1,
    pnl: rounds.slice(0, i + 1).reduce((s, x) => s + x.reward - x.totalBet, 0),
  }));
}

describe('pnlTrend 前缀和', () => {
  it('空输入返回空数组', () => {
    expect(pnlTrend([])).toEqual([]);
  });

  it('单局：pnl 等于该局净盈亏', () => {
    const rounds: RoundLike[] = [
      { power: 'mid', multiplier: 2, hit: true, totalBet: 100, reward: 260, litHoles: [], landHole: 3 },
    ];
    expect(pnlTrend(rounds)).toEqual([{ round: 1, pnl: 160 }]);
  });

  it('① 与旧 slice+reduce 实现逐点严格相等（1000 局混合数据）', () => {
    const rounds = makeRounds(1000, 'pnl-trend-parity');
    expect(pnlTrend(rounds)).toEqual(legacyPnlTrend(rounds));
  });

  it('② 含负值与零值仍逐点相等（亏局长序列）', () => {
    const rounds = makeRounds(200, 'pnl-trend-negative').map((r) => ({ ...r, reward: 0 }));
    expect(pnlTrend(rounds)).toEqual(legacyPnlTrend(rounds));
  });

  it('③ 极端小数累加顺序敏感场景逐点相等', () => {
    // 0.1 类小数对加法顺序敏感：验证左结合假设
    const rounds: RoundLike[] = Array.from({ length: 50 }, () => ({
      power: 'low',
      multiplier: 2,
      hit: false,
      totalBet: 1,
      reward: 0.1,
      litHoles: [],
      landHole: 1,
    }));
    expect(pnlTrend(rounds)).toEqual(legacyPnlTrend(rounds));
  });

  it('round 序号为 1-based 递增', () => {
    const trend = pnlTrend(makeRounds(10, 'pnl-trend-index'));
    expect(trend.map((p) => p.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
