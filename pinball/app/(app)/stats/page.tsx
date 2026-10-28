import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import {
  calibration,
  backtest,
  regretCurve,
  chiSquareUniform,
  logLikelihoodRolling,
  powerMultiplierMatrix,
  pnlTrend,
  type RoundLike,
} from '@/lib/predict/evaluate';
import { StatsCharts } from './StatsCharts';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const session = await auth();
  if (!session?.tenantId) redirect('/login');

  const rounds = await withTenant(session.tenantId, (tx) =>
    tx.round.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        power: true,
        multiplier: true,
        hit: true,
        totalBet: true,
        reward: true,
        litHoles: true,
        landHole: true,
        recommendedPower: true,
        createdAt: true,
      },
    }),
  );

  const typed: RoundLike[] = rounds.map((r) => ({
    power: r.power as RoundLike['power'],
    multiplier: r.multiplier,
    hit: r.hit,
    totalBet: r.totalBet,
    reward: r.reward,
    litHoles: r.litHoles,
    landHole: r.landHole,
    recommendedPower: (r.recommendedPower as RoundLike['power'] | null) ?? null,
  }));

  const data = {
    totalRounds: typed.length,
    totalBet: typed.reduce((s, r) => s + r.totalBet, 0),
    totalWin: typed.reduce((s, r) => s + r.reward, 0),
    hitRate: typed.length === 0 ? 0 : typed.filter((r) => r.hit).length / typed.length,
    calibration: calibration(typed),
    backtest: backtest(typed),
    regret: regretCurve(typed),
    chiSquare: chiSquareUniform(
      typed.map((r) => r.landHole),
      12,
    ),
    logLikelihood: logLikelihoodRolling(typed, null),
    matrix: powerMultiplierMatrix(typed),
    landDist: Array.from({ length: 12 }, (_, i) => typed.filter((r) => r.landHole === i + 1).length),
    pnlTrend: pnlTrend(typed),
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 space-y-4">
      <h1 className="text-lg font-bold">复盘统计</h1>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
        <Kpi label="总局数" value={data.totalRounds} />
        <Kpi label="总投入" value={data.totalBet} />
        <Kpi label="总中奖" value={data.totalWin} />
        <Kpi label="净盈亏" value={data.totalWin - data.totalBet} accent />
      </div>
      <StatsCharts data={data} />
    </main>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-2">
      <div className="text-[var(--muted)]">{label}</div>
      <div className={`font-bold tabular-nums ${accent ? (value >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]') : ''}`}>
        {value}
      </div>
    </div>
  );
}
