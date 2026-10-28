'use client';

import { useCallback, useEffect, useState } from 'react';
import { chiSquare } from '@/lib/predict/evaluate';

interface SimResultRow {
  power: string;
  fitVersion: number;
  dist: number[];
  stderr: number[];
}

/**
 * L2 蒙特卡洛面板：模拟分布 vs 实测分布柱状对比 + 误差棒 + χ² 失拟提示。
 */
export function MonteCarloPanel({
  machineId,
  observed,
  power,
}: {
  machineId: string;
  /** 实测落点分布（12 通道计数或概率） */
  observed: number[];
  power?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SimResultRow[] | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ machineId });
    if (power) qs.set('power', power);
    const res = await fetch(`/api/montecarlo?${qs}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.pending) {
      setPending(true);
      // 简单轮询：3s 后重试一次
      setTimeout(() => void load(), 3000);
      return;
    }
    setPending(false);
    setRows(data.results ?? []);
  }, [machineId, power]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const obsTotal = observed.reduce((s, x) => s + x, 0);
  const obsDist = obsTotal > 0 ? observed.map((x) => x / obsTotal) : new Array(12).fill(0);
  const row = rows?.[0];

  const chi = row ? chiSquare(obsDist.map((p) => p * obsTotal), row.dist.map((p) => p * obsTotal)) : null;
  const misfit = chi !== null && chi.pValue < 0.01;

  return (
    <div className="rounded-xl border border-[var(--border)] p-3 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-bold"
      >
        <span>L2 蒙特卡洛盘面模拟</span>
        <span className="text-[var(--muted)]">{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {pending && <p className="text-[var(--muted)]">模拟计算中…</p>}
          {row && (
            <>
              <div className="grid grid-cols-12 items-end gap-0.5" style={{ height: 80 }}>
                {row.dist.map((p, i) => (
                  <div key={i} className="flex h-full flex-col justify-end gap-0.5">
                    <div
                      className="w-full rounded-sm bg-[var(--accent)]"
                      style={{ height: `${p * 100}%` }}
                      title={`模拟 ${(p * 100).toFixed(1)}%`}
                    />
                    <div
                      className="w-full rounded-sm bg-[var(--muted)]"
                      style={{ height: `${obsDist[i] * 100}%` }}
                      title={`实测 ${(obsDist[i] * 100).toFixed(1)}%`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 text-[10px] text-[var(--muted)]">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[var(--accent)]" /> 模拟
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[var(--muted)]" /> 实测
                </span>
                <span>fitVersion {row.fitVersion}</span>
              </div>
              {misfit && (
                <p className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-2 py-1">
                  该机台偏离理想盘面（χ² p&lt;0.01），以实测统计为准。
                </p>
              )}
            </>
          )}
          {!row && !pending && <p className="text-[var(--muted)]">暂无模拟数据</p>}
        </div>
      )}
    </div>
  );
}
