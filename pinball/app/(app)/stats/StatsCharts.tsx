'use client';

import {
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
  /** 发力 × 洞位落点计数矩阵（固定 3 档顺序，含每档 total） */
  landHoleByPower: { power: string; total: number; holes: number[] }[];
  pnlTrend: { round: number; pnl: number }[];
}

/** 统计页全套图表（Recharts） */
export function StatsCharts({ data }: { data: StatsData }) {
  if (data.totalRounds === 0) {
    return <p className="text-sm text-[var(--muted)]">暂无数据，先录入几局吧。</p>;
  }

  const axis = { stroke: 'var(--muted)', fontSize: 10 };
  // 洞位数列以矩阵实际宽度为准（服务端固定 12，避免再次硬编码）
  const holeCount = data.landHoleByPower[0]?.holes.length ?? 12;
  // 单一 grid 容器承载表头+数据行：所有行共享同一套列轨道，从根上消除错位。
  // 洞位列 minmax(0,1fr) 允许收缩 → 390px 视口无需横向滚动。
  const heatmapCols = `auto repeat(${holeCount}, minmax(0, 1fr)) auto`;
  // 表头/数据/合计共用同一盒子模型——不一致的 padding/min-width 是列宽错位的根因
  const heatCell =
    'flex min-h-6 items-center justify-center rounded px-0.5 py-0.5 text-center text-[10px] tabular-nums leading-none';

  return (
    <div className="space-y-6">
      {/* 落点分布：发力 × 洞位矩阵热力图 */}
      <section>
        <h2 className="mb-1 text-sm font-bold">落点分布（发力 × 洞位）</h2>
        {/* 单 grid：表头与数据行共享列轨道，跨行严格对齐 */}
        <div
          className="grid items-center gap-0.5 text-[10px]"
          style={{ gridTemplateColumns: heatmapCols }}
        >
          {/* 第 1 行：表头 */}
          <div className="px-0.5 py-0.5 text-left text-[var(--muted)]">发力</div>
          {Array.from({ length: holeCount }, (_, i) => (
            <div key={`h${i}`} className={`${heatCell} text-[var(--muted)]`}>
              {i + 1}
            </div>
          ))}
          <div className="px-0.5 py-0.5 text-center text-[var(--muted)]">合计</div>

          {/* 数据行：着色强度按行内最大计数归一（10%-90%）；全 0 行不着色 */}
          {data.landHoleByPower.map((row) => {
            const max = Math.max(0, ...row.holes);
            const label = POWER_LABEL[row.power] ?? row.power;
            return [
              <div key={`${row.power}-lbl`} className="whitespace-nowrap px-0.5 py-0.5">
                {label}
              </div>,
              ...row.holes.map((n, i) => (
                <div
                  key={`${row.power}-${i}`}
                  title={`${label} · ${i + 1} 号洞：${n} 局${
                    row.total > 0 ? `（本档 ${((n / row.total) * 100).toFixed(0)}%）` : ''
                  }`}
                  className={`${heatCell} ${
                    n === 0 ? 'text-[var(--muted)]' : 'text-[var(--fg)]'
                  }`}
                  style={{
                    background:
                      n > 0 && max > 0
                        ? `color-mix(in srgb, var(--accent) ${Math.max(10, Math.round((n / max) * 90))}%, var(--surface))`
                        : 'var(--surface)',
                  }}
                >
                  {n > 0 ? n : '·'}
                </div>
              )),
              <div
                key={`${row.power}-total`}
                className="px-0.5 py-0.5 text-center tabular-nums text-[var(--muted)]"
              >
                {row.total}
              </div>,
            ];
          })}
        </div>
        <p className="mt-1 text-[10px] text-[var(--muted)]">
          行内颜色深 = 该发力档落此洞更多（按行内最大计数归一）；「·」= 尚无记录。
        </p>
        <p className="text-[10px] text-[var(--muted)]">
          均匀期望（每洞 {data.totalRounds}/12 ≈ {(data.totalRounds / 12).toFixed(1)} 局）；χ² ={' '}
          {data.chiSquare.chi2.toFixed(2)}，p = {data.chiSquare.pValue.toFixed(3)}
          {data.chiSquare.pValue < 0.01 ? '（盘面偏态显著）' : ''}
        </p>
        <p className="mt-1 text-[10px] text-[var(--muted)]">历史统计不构成未来保证。</p>
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
        <p className="mb-1 text-[10px] text-[var(--muted)]">
          把每局的预测命中概率分成 10 个区间，对比该区间的实际命中率：点贴虚线对角线 = 预测准；
          点在线上方 = 实际更常命中（低估），在线下方 = 实际更少命中（高估）。
        </p>
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
        <p className="mt-1 text-[10px] text-[var(--muted)]">
          可信度：只有录入时就记录了预测概率的局才参与校准；这类局从本次修复后才开始产生，
          更早的历史局无预测值，会统一按全局命中率兜底，使曲线退化为竖直线。
        </p>
      </section>

      {/* Regret 曲线 */}
      <section>
        <h2 className="mb-1 text-sm font-bold">累计后悔</h2>
        <p className="mb-1 text-[10px] text-[var(--muted)]">
          每局「当时已知最高返还率 − 本局实际返还率」的累计和（差为负记 0）。
          曲线越陡 = 该阶段的档位选择偏离当时最优越多、代价越大；走平 = 选择已接近最优。
        </p>
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
        <p className="mb-1 text-[10px] text-[var(--muted)]">
          对比「每局都按系统推荐发力」的期望盈亏（按同档历史命中率估算返还）与实际盈亏
          （实际返还 − 实际投入）；差值反映推荐质量：为负 = 推荐不如实际打法，为正 = 推荐更优。
        </p>
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
        <p className="mt-1 text-[10px] text-[var(--muted)]">
          样本 n = {data.backtest.n}（仅统计录入时记录了推荐的局）。修复前录入的历史局没有推荐记录，
          因此 n 会远小于总局数，并从 0 开始增长——样本越少，结论越不稳定。
        </p>
      </section>
    </div>
  );
}
