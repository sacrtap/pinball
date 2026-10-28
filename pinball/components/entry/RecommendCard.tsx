'use client';

import { POWER_LEVELS } from '@/lib/rules';
import type { PowerLevel } from '@/lib/types';

const POWER_LABEL: Record<string, string> = { low: '小力', mid: '中力', high: '大力' };

export interface Recommendation {
  mode: 'thompson' | 'prior';
  degraded: boolean;
  message?: string;
  thompsonPower?: PowerLevel;
  argmaxPower?: PowerLevel;
  bestArmProb?: number[];
  litHitProb?: number;
  channelProb?: number[];
  prior?: { channelProb: number[] };
}

/**
 * step1 置顶推荐卡（常驻，非抽屉）：
 * 推荐档位 + 三档概率 + 亮灯联合命中/中奖奖励（与概率条同行）+ 12 通道热力条（红点标亮灯）。
 */
export function RecommendCard({
  data,
  litHoles,
  totalBet,
  multiplier,
}: {
  data: Recommendation;
  litHoles: number[];
  totalBet: number;
  multiplier: number;
}) {
  const probs = data.channelProb ?? data.prior?.channelProb ?? [];
  const maxP = Math.max(...probs, 1e-9);
  const hitProb = data.litHitProb ?? 0;
  // 「返还」展示中奖奖励（投入×倍率，整数珠数）——单局只有中奖/不中奖两种结果，
  // 奖励是离散值而非概率加权期望，避免小数让用户困惑。
  const reward = totalBet * multiplier;

  return (
    <section
      aria-label="发力推荐"
      className="space-y-2 rounded-2xl border border-[var(--accent)]/50 bg-[var(--surface)] p-3"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-medium text-[var(--muted)]">发力推荐</h3>
        <span className="text-[10px] text-[var(--muted)]">
          {data.mode === 'thompson' ? 'Thompson 采样' : '先验'}
        </span>
      </div>

      {data.degraded && (
        <p className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-2 py-1 text-[11px]">
          {data.message ?? '各档无显著差异，正在探索'}
        </p>
      )}

      {data.thompsonPower && (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-[var(--accent)]">
            {POWER_LABEL[data.thompsonPower] ?? data.thompsonPower}
          </span>
          <span className="text-[10px] text-[var(--muted)]">
            {data.thompsonPower === data.argmaxPower ? '与点估计一致 · 高置信' : '按推荐执行以加速学习'}
          </span>
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          {POWER_LEVELS.map((p, i) => {
            const prob = data.bestArmProb?.[i] ?? 0;
            const best = p === data.thompsonPower;
            return (
              <div key={p} className="flex items-center gap-1.5 text-[11px]">
                <span className={`w-7 shrink-0 ${best ? 'text-[var(--fg)]' : 'text-[var(--muted)]'}`}>
                  {POWER_LABEL[p]}
                </span>
                <div className="h-2 flex-1 rounded-full bg-[var(--border)]">
                  <div
                    className={`h-2 rounded-full ${best ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]/60'}`}
                    style={{ width: `${prob * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right tabular-nums">
                  {(prob * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>

        <dl className="w-16 shrink-0 space-y-1 border-l border-[var(--border)] pl-2 text-center">
          <div>
            <dt className="text-[10px] text-[var(--muted)]">命中</dt>
            <dd className="text-sm font-bold tabular-nums">{(hitProb * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt className="text-[10px] text-[var(--muted)]">中奖</dt>
            <dd className="text-sm font-bold tabular-nums">{reward}</dd>
          </div>
        </dl>
      </div>

      {probs.length === 12 && (
        <div>
          <div className="flex items-baseline justify-between text-[10px] text-[var(--muted)]">
            <span>
              12 通道落点概率
              {data.thompsonPower ? `（${POWER_LABEL[data.thompsonPower]}）` : ''}
            </span>
            <span className="flex items-center gap-1">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--error)]" />
              亮灯
            </span>
          </div>
          <div className="mt-1 grid grid-cols-12 gap-0.5">
            {probs.map((p, i) => {
              const lit = litHoles.includes(i + 1);
              return (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: lit ? 'var(--error)' : 'transparent' }}
                  />
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: `${Math.max(3, (p / maxP) * 30)}px`,
                      background: lit ? 'var(--accent)' : 'var(--muted)',
                      opacity: lit ? 1 : 0.3 + (p / maxP) * 0.5,
                    }}
                    title={`${i + 1} 号洞 ${(p * 100).toFixed(1)}%${lit ? '（亮灯）' : ''}`}
                  />
                  <span
                    className={`text-[8px] font-bold tabular-nums ${
                      lit ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {p < 0.001 ? '0' : (p * 100).toFixed(1)}
                  </span>
                  <span className="text-[8px] tabular-nums text-[var(--muted)]">{i + 1}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            柱下数字为该通道落点概率；亮灯通道 {litHoles.join('、')} 之和 = 命中{' '}
            {(hitProb * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </section>
  );
}
