'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TouchButton } from '@/components/ui/TouchButton';

export function NewSessionButton({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onCreate() {
    setLoading(true);
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId }),
    });
    setLoading(false);
    if (!res.ok) return;
    const { session } = await res.json();
    router.push(`/session/${session.id}/play`);
  }

  return (
    <TouchButton block onClick={onCreate} loading={loading}>
      {loading ? '创建中…' : '开始新对局'}
    </TouchButton>
  );
}
