'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerAutoSync, pendingCount, flush, subscribeQueue } from '@/lib/offline/outbox';

/** 注册在线自动同步；队列非空时显示「已暂存，恢复网络后自动同步」 */
export function EntrySync() {
  const [pending, setPending] = useState(0);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (navigator.onLine && pendingCount() > 0) {
      const r = await flush();
      setPending(r.remaining);
      // 同步成功后刷新 RSC，让累计统计反映重放的局
      if (r.sent > 0) router.refresh();
    } else {
      setPending(pendingCount());
    }
  }, [router]);

  useEffect(() => {
    const unregister = registerAutoSync();
    const unsubscribe = subscribeQueue(() => void refresh());
    setPending(pendingCount());
    void refresh();
    return () => {
      unregister();
      unsubscribe();
    };
  }, [refresh]);

  if (pending === 0) return null;
  return (
    <p className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-xs">
      有 {pending} 局已暂存，恢复网络后自动同步。
    </p>
  );
}
