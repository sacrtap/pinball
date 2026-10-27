'use client';

import { useState } from 'react';
import { POWER_LEVELS } from '@/lib/rules';

export interface Recommendation {
  mode: 'thompson' | 'prior';
  degraded: boolean;
  sampleN?: number;
  message?: string;
  thompsonPower?: string;
  argmaxPower?: string;
  bestArmProb?: number[];
  litHitProb?: number;
  expectedReturn?: number;
  channelProb?: number[];
  prior?: { channelProb: number[]; alpha0Table: Record<string, number> };
}

const POWER_LABEL: Record<string, string> = { low: '小力', mid: '中力', high: '大力' };

/**
 * 推荐抽屉：不阻塞录入流。
 * Thompson 双轨 + 置信度 + 12 通道概率热力条 + 亮灯联合命中 + 期望返还；
 * degraded/样本不足时标注降级原因。
 */
export function RecommendSheet({
  data,
  litHoles,
  onClose,
}: {
  data: Recommendation | null;
  litHoles: number[];
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  if (!data || !open) return null;

  const close = () => {
    setOpen(false);
    onClose();
  };

  const probs = data.channelProb ?? data.prior?.channelProb ?? [];
  const maxP = Math.max(...probs, 1e-9);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">发力推荐</h3>
        <button type="button" onClick={close} className="text-[var(--muted)] text-sm">
          关闭
        </button>
      </div>

      {data.mode === 'prior' || data.degraded ? (
        <p className="mt-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-xs">
          {data.message ?? '各档无显著差异，正在探索'}
        </p>
      ) : null}

      {data.thompsonPower && (
        <div className="mt-3 space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--accent)]">
              {POWER_LABEL[data.thompsonPower] ?? data.thompsonPower}
            </span>
            <span className="text-xs text-[var(--muted)]">
              Thompson 推荐
              {data.thompsonPower === data.argmaxPower ? '（与点估计一致 · 高置信）' : ''}
            </span>
          </div>

          {data.bestArmProb && (
            <div className="space-y-1">
              {POWER_LEVELS.map((p, i) => (
                <div key={p} className="flex items-center gap-2 text-xs">
                  <span className="w-8 text-[var(--muted)]">{POWER_LABEL[p]}</span>
                  <div className="h-2 flex-1 rounded-full bg-[var(--border)]">
                    <div
                      className={`h-2 rounded-full ${p === data.thompsonPower ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]'}`}
                      style={{ width: `${(data.bestArmProb?.[i] ?? 0) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums">
                    {((data.bestArmProb?.[i] ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-[var(--border)] p-2">
              <div className="text-[var(--muted)]">亮灯联合命中</div>
              <div className="font-bold tabular-nums">
                {((data.litHitProb ?? 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-2">
              <div className="text-[var(--muted)]">期望返还</div>
              <div className="font-bold tabular-nums">{(data.expectedReturn ?? 0).toFixed(1)}</div>
            </div>
          </div>

          {data.thompsonPower !== data.argmaxPower && (
            <p className="text-xs text-[var(--muted)]">
              Thompson 与点估计不一致：建议按 Thompson 执行以加速学习。
            </p>
          )}
        </div>
      )}

      {probs.length === 12 && (
        <div className="mt-3">
          <div className="text-xs text-[var(--muted)]">12 通道落点概率</div>
          <div className="mt-1 grid grid-cols-12 gap-0.5">
            {probs.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-sm bg-[var(--accent)]"
                  style={{ height: `${Math.max(2, (p / maxP) * 40)}px`, opacity: 0.35 + (p / maxP) * 0.65 }}
                  title={`${i + 1} 号洞 ${(p * 100).toFixed(1)}%`}
                />
                <span className="text-[8px] text-[var(--muted)]">{i + 1}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            亮灯通道：{litHoles.join('、')}
          </p>
        </div>
      )}
    </div>
  );
}
