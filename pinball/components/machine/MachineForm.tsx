'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TouchButton } from '@/components/ui/TouchButton';
import { Input } from '@/components/ui/Input';
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
        <Input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-[var(--muted)]">名称</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-[var(--muted)]">场所</span>
        <Input
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      <TouchButton type="submit" block loading={loading}>
        {loading ? '创建中…' : '创建机台'}
      </TouchButton>
    </form>
  );
}
