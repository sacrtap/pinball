'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TouchButton } from '@/components/ui/TouchButton';
import type { Machine } from '@/lib/types';

export function MachineList({ initialMachines }: { initialMachines: Machine[] }) {
  const router = useRouter();
  const [machines, setMachines] = useState(initialMachines);

  async function onDelete(id: string) {
    if (!confirm('删除机台将级联删除其全部对局与模型数据，确认？')) return;
    await fetch(`/api/machines/${id}`, { method: 'DELETE' });
    setMachines((prev) => prev.filter((m) => m.id !== id));
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
          <TouchButton variant="danger" onClick={() => onDelete(m.id)} aria-label={`删除 ${m.code}`}>
            删除
          </TouchButton>
        </li>
      ))}
    </ul>
  );
}
