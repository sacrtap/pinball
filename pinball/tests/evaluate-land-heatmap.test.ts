import { describe, it, expect } from 'vitest';
import { landHoleByPower, type RoundLike } from '@/lib/predict/evaluate';

/**
 * landHoleByPower：发力 × 洞位落点计数矩阵。
 * 这是统计页热力图的唯一数据来源，须保证：
 * 1. 输出恒为 POWER_LEVELS 固定顺序（low/mid/high），与数据是否存在无关；
 * 2. 每档 holes 长度恒等于 holeCount，缺失补 0（前端渲染「·」而非 undefined）；
 * 3. 每档 total 恒等于该行 holes 之和（行内占比/χ² 期望依赖此不变量）；
 * 4. 脏数据（洞位越界/非整数）不得污染矩阵。
 */

function round(over: Partial<RoundLike> = {}): RoundLike {
  return {
    power: 'low',
    multiplier: 2,
    hit: false,
    totalBet: 5,
    reward: 0,
    litHoles: [1, 2, 3, 4, 5],
    landHole: 1,
    ...over,
  };
}

describe('landHoleByPower 落点×发力聚合', () => {
  it('空输入：仍返回三档固定顺序，行全 0 且 total=0', () => {
    const rows = landHoleByPower([], 12);
    expect(rows.map((r) => r.power)).toEqual(['low', 'mid', 'high']);
    for (const row of rows) {
      expect(row.total).toBe(0);
      expect(row.holes).toHaveLength(12);
      expect(row.holes.every((n) => n === 0)).toBe(true);
    }
  });

  it('缺失档补 0：只有 mid 有数据时 low/high 行仍存在且全 0', () => {
    const rows = landHoleByPower([round({ power: 'mid', landHole: 7 })], 12);
    expect(rows.find((r) => r.power === 'low')!.holes.every((n) => n === 0)).toBe(true);
    expect(rows.find((r) => r.power === 'low')!.total).toBe(0);
    expect(rows.find((r) => r.power === 'high')!.total).toBe(0);
    const mid = rows.find((r) => r.power === 'mid')!;
    expect(mid.holes[6]).toBe(1);
    expect(mid.total).toBe(1);
  });

  it('计数按发力档 + 洞位分桶（不同档同洞位互不干扰）', () => {
    const rows = landHoleByPower(
      [
        round({ power: 'low', landHole: 3 }),
        round({ power: 'low', landHole: 3 }),
        round({ power: 'low', landHole: 12 }),
        round({ power: 'high', landHole: 3 }),
      ],
      12,
    );
    const low = rows.find((r) => r.power === 'low')!;
    const high = rows.find((r) => r.power === 'high')!;
    expect(low.holes[2]).toBe(2);
    expect(low.holes[11]).toBe(1);
    expect(low.total).toBe(3);
    expect(high.holes[2]).toBe(1);
    expect(high.total).toBe(1);
  });

  it('不变量：每行 total 恒等于该行 holes 之和', () => {
    const rounds: RoundLike[] = [
      round({ power: 'low', landHole: 1 }),
      round({ power: 'mid', landHole: 5 }),
      round({ power: 'mid', landHole: 5 }),
      round({ power: 'high', landHole: 12 }),
      round({ power: 'high', landHole: 2 }),
      round({ power: 'high', landHole: 2 }),
    ];
    for (const row of landHoleByPower(rounds, 12)) {
      expect(row.total).toBe(row.holes.reduce((s, n) => s + n, 0));
    }
    // 总计数 = 有效局数
    const grand = landHoleByPower(rounds, 12).reduce((s, r) => s + r.total, 0);
    expect(grand).toBe(rounds.length);
  });

  it('洞位越界安全：0 / 超上限 / 非整数不计入，行 total 不虚增', () => {
    const rows = landHoleByPower(
      [
        round({ power: 'low', landHole: 0 }),
        round({ power: 'low', landHole: 13 }),
        round({ power: 'low', landHole: 2.5 }),
        round({ power: 'low', landHole: 12 }),
      ],
      12,
    );
    const low = rows.find((r) => r.power === 'low')!;
    expect(low.total).toBe(1);
    expect(low.holes[11]).toBe(1);
    expect(low.holes.every((n) => n >= 0)).toBe(true);
  });

  it('holeCount 可变：输出长度跟随入参而非硬编码 12', () => {
    const rows = landHoleByPower([round({ landHole: 4 })], 6);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.holes).toHaveLength(6);
    expect(rows[0].holes[3]).toBe(1);
  });

  it('纯函数：不修改输入数组，多次调用结果一致', () => {
    const rounds = [round({ power: 'mid', landHole: 9 })];
    const snapshot = JSON.parse(JSON.stringify(rounds));
    const a = landHoleByPower(rounds, 12);
    const b = landHoleByPower(rounds, 12);
    expect(rounds).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});
