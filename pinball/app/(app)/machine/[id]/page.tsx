import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { NewSessionButton } from '@/components/session/NewSessionButton';

export const dynamic = 'force-dynamic';

export default async function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.tenantId) redirect('/login');

  const data = await withTenant(session.tenantId, async (tx) => {
    const machine = await repo.getMachine(tx, id);
    if (!machine) return null;
    const sessions = await repo.listSessions(tx, id);
    return { machine, sessions };
  });
  if (!data) notFound();

  const totalRounds = data.sessions.reduce((s, x) => s + x.roundCount, 0);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">{data.machine.name || data.machine.code}</h1>
        <p className="text-sm text-[var(--muted)]">
          {data.machine.venue ? `${data.machine.venue} · ` : ''}
          {data.machine.holeCount} 洞 · 累计 {totalRounds} 局
        </p>
      </header>

      <NewSessionButton machineId={data.machine.id} />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-[var(--muted)]">对局记录</h2>
        {data.sessions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">还没有对局。</p>
        ) : (
          <ul className="space-y-2">
            {data.sessions.map((s) => (
              <li key={s.id} className="rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-center justify-between">
                  <a href={`/session/${s.id}/play`} className="font-medium">
                    {new Date(s.startedAt).toLocaleString('zh-CN')}
                  </a>
                  <span className="text-xs text-[var(--muted)]">{s.status === 'active' ? '进行中' : '已关闭'}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {s.roundCount} 局 · 投入 {s.totalBet} · 中奖 {s.totalWin} · 卡片 {s.cards}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
