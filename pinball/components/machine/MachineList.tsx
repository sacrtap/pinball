'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TouchButton } from '@/components/ui/TouchButton';
import type { Machine } from '@/lib/types';

export function MachineList({ initialMachines }: { initialMachines: Machine[] }) {
  const router = useRouter();
  const [machines, setMachines] = useState(initialMachines);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function doDelete(id: string) {
    await fetch(`/api/machines/${id}`, { method: 'DELETE' });
    setMachines((prev) => prev.filter((m) => m.id !== id));
    setConfirmingId(null);
    router.refresh();
  }

  if (machines.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
        还没有机台，点击「新建机台」开始建档。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {machines.map((m) => (
        <li
          key={m.id}
          className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
        >
          <Link href={`/machine/${m.id}`} className="min-h-12 flex flex-1 flex-col justify-center">
            <span className="font-medium">{m.name || m.code}</span>
            <span className="text-xs text-[var(--muted)]">
              {m.venue ? `${m.venue} · ` : ''}
              {m.holeCount} 洞
            </span>
          </Link>
          {confirmingId === m.id ? (
            <span className="flex items-center gap-1 text-xs">
              确认删除？
              <TouchButton variant="ghost" onClick={() => setConfirmingId(null)}>
                取消
              </TouchButton>
              <TouchButton variant="danger" onClick={() => doDelete(m.id)}>
                确认
              </TouchButton>
            </span>
          ) : (
            <TouchButton variant="danger" onClick={() => setConfirmingId(m.id)} aria-label={`删除 ${m.code}`}>
              删除
            </TouchButton>
          )}
        </li>
      ))}
    </ul>
  );
}
