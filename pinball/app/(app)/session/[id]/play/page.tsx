import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { EntryWizard } from '@/components/entry/EntryWizard';
import { EntrySync } from '@/components/entry/EntrySync';

export const dynamic = 'force-dynamic';

export default async function SessionPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.tenantId) redirect('/login');

  const data = await withTenant(session.tenantId, async (tx) => {
    const s = await repo.getSession(tx, id);
    if (!s) return null;
    return { session: s };
  });
  if (!data) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5 space-y-3">
      {/* 挂载时注册 online 自动同步 + 队列非空即 flush */}
      <EntrySync />
      <EntryWizard
        sessionId={data.session.id}
        machineId={data.session.machineId}
        overview={{
          roundCount: data.session.roundCount,
          totalBet: data.session.totalBet,
          totalWin: data.session.totalWin,
          cards: data.session.cards,
        }}
      />
    </main>
  );
}
