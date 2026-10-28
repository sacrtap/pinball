'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TouchButton } from '@/components/ui/TouchButton';
import { Card } from '@/components/ui/Card';
import type { Machine } from '@/lib/types';

export function MachineList({ initialMachines }: { initialMachines: Machine[] }) {
  const router = useRouter();
  const [machines, setMachines] = useState(initialMachines);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function doDelete(id: string) {
    // 防重：删除进行中忽略重复触发（双击「确认」只发一次 DELETE）
    if (deletingId) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/machines/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('DELETE_FAILED');
      setMachines((prev) => prev.filter((m) => m.id !== id));
      setConfirmingId(null);
      router.refresh();
    } catch {
      // 失败保持确认态，允许重试；不清 confirmingId
      setDeleteError('删除失败，请重试');
    } finally {
      setDeletingId(null);
    }
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
        <Card
          key={m.id}
          className="flex items-center justify-between gap-2"
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
              <TouchButton variant="ghost" size="sm" onClick={() => setConfirmingId(null)} disabled={deletingId !== null}>
                取消
              </TouchButton>
              <TouchButton variant="danger" size="sm" onClick={() => doDelete(m.id)} loading={deletingId === m.id}>
                确认
              </TouchButton>
            </span>
          ) : (
            <TouchButton variant="danger" size="sm" onClick={() => setConfirmingId(m.id)} aria-label={`删除 ${m.code}`}>
              删除
            </TouchButton>
          )}
          {deleteError && confirmingId === m.id && (
            <span role="alert" className="ml-1 text-xs text-[var(--error)]">{deleteError}</span>
          )}
        </Card>
      ))}
    </ul>
  );
}
