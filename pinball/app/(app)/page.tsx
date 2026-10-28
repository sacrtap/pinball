import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { MachineList } from '@/components/machine/MachineList';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (!session.tenantId) redirect('/login');

  const machines = await withTenant(session.tenantId, (tx) => repo.listMachines(tx));

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 space-y-4">
      <DisclaimerBanner />
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">我的机台</h1>
        <Link
          href="/machine/new"
          className="min-h-12 inline-flex items-center rounded-xl bg-[var(--accent)] px-4 text-white"
        >
          新建机台
        </Link>
      </header>
      <MachineList initialMachines={machines} />
    </main>
  );
}
