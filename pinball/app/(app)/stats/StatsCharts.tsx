'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { POWER_LABEL } from '@/lib/labels';

export interface StatsData {
  totalRounds: number;
  totalBet: number;
  totalWin: number;
  hitRate: number;
  calibration: { bucket: number; predicted: number; actual: number; n: number }[];
  backtest: { adopted: number; actual: number; delta: number; n: number };
  regret: { round: number; regret: number; cumulative: number }[];
  chiSquare: { chi2: number; df: number; pValue: number };
  logLikelihood: { round: number; l1: number; l2: number }[];
  matrix: { power: string; multiplier: number; rate: number; n: number }[];
  landDist: number[];
  pnlTrend: { round: number; pnl: number }[];
}

/** 统计页全套图表（Recharts） */
export function StatsCharts({ data }: { data: StatsData }) {
  if (data.totalRounds === 0) {
    return <p className="text-sm text-[var(--muted)]">暂无数据，先录入几局吧。</p>;
  }

  const axis = { stroke: 'var(--muted)', fontSize: 10 };

  return (
    <div className="space-y-6">
      {/* 落点分布直方图 */}
      <section>
        <h2 className="mb-1 text-sm font-bold">落点分布</h2>
        <div className="h-40">
          <ResponsiveContainer>
            <BarChart data={data.landDist.map((n, i) => ({ hole: i + 1, n }))}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="hole" tick={axis} />
              <YAxis tick={axis} />
              <Tooltip />
              <ReferenceLine
                y={data.totalRounds / 12}
                stroke="var(--warning)"
                strokeDasharray="3 3"
              />
              <Bar dataKey="n" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-[var(--muted)]">
          虚线 = 均匀期望（{data.totalRounds}/12）；χ² = {data.chiSquare.chi2.toFixed(2)}，
          p = {data.chiSquare.pValue.toFixed(3)}
          {data.chiSquare.pValue < 0.01 ? '（盘面偏态显著）' : ''}
        </p>
      </section>

      {/* 盈亏趋势 */}
      <section>
        <h2 className="mb-1 text-sm font-bold">盈亏趋势</h2>
        <div className="h-40">
          <ResponsiveContainer>
            <LineChart data={data.pnlTrend}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="round" tick={axis} />
              <YAxis tick={axis} />
              <Tooltip />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Line type="monotone" dataKey="pnl" stroke="var(--accent)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 校准曲线 */}
      <section>
        <h2 className="mb-1 text-sm font-bold">模型校准</h2>
        <div className="h-40">
          <ResponsiveContainer>
            <LineChart data={data.calibration.filter((b) => b.n > 0)}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="predicted" tick={axis} domain={[0, 1]} />
              <YAxis tick={axis} domain={[0, 1]} />
              <Tooltip />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: 1, y: 1 },
                ]}
                stroke="var(--muted)"
                strokeDasharray="3 3"
              />
              <Line type="monotone" dataKey="actual" stroke="var(--success)" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Regret 曲线 */}
      <section>
        <h2 className="mb-1 text-sm font-bold">累计后悔</h2>
        <div className="h-40">
          <ResponsiveContainer>
            <LineChart data={data.regret}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="round" tick={axis} />
              <YAxis tick={axis} />
              <Tooltip />
              <Line type="monotone" dataKey="cumulative" stroke="var(--c4)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 发力×倍率命中率矩阵 */}
      <section>
        <h2 className="mb-1 text-sm font-bold">发力 × 倍率命中率</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="p-1 text-left text-[var(--muted)]">发力</th>
                {[2, 4, 6, 8, 10].map((m) => (
                  <th key={m} className="p-1 text-[var(--muted)]">
                    {m}×
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['low', 'mid', 'high'].map((p) => (
                <tr key={p}>
                  <td className="p-1">{POWER_LABEL[p] ?? p}</td>
                  {data.matrix
                    .filter((m) => m.power === p)
                    .map((m) => (
                      <td key={m.multiplier} className="p-1 text-center tabular-nums">
                        <span
                          className="inline-block rounded px-1.5 py-0.5"
                          style={{
                            background: `color-mix(in srgb, var(--accent) ${Math.round(m.rate * 70)}%, transparent)`,
                          }}
                        >
                          {m.n > 0 ? `${(m.rate * 100).toFixed(0)}%` : '—'}
                        </span>
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 回测 */}
      <section>
        <h2 className="mb-1 text-sm font-bold">推荐回测</h2>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-[var(--border)] p-2">
            <div className="text-[var(--muted)]">采纳推荐期望</div>
            <div className="font-bold tabular-nums">{data.backtest.adopted.toFixed(1)}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] p-2">
            <div className="text-[var(--muted)]">实际盈亏</div>
            <div className="font-bold tabular-nums">{data.backtest.actual.toFixed(1)}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] p-2">
            <div className="text-[var(--muted)]">差值</div>
            <div className="font-bold tabular-nums">{data.backtest.delta.toFixed(1)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
