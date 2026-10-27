'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TouchButton } from '@/components/ui/TouchButton';
import { HOLE_COUNT } from '@/lib/rules';

export function MachineForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name: name || null, venue: venue || null, holeCount: HOLE_COUNT }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === 'INVALID_INPUT' ? '请检查输入（编号必填）' : '创建失败');
      return;
    }
    router.push('/');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm text-[var(--muted)]">机台编号 *</span>
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-[var(--muted)]">名称</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-[var(--muted)]">场所</span>
        <input
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3"
        />
      </label>
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      <TouchButton type="submit" block disabled={loading}>
        {loading ? '创建中…' : '创建机台'}
      </TouchButton>
    </form>
  );
}
