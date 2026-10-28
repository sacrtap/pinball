'use client';

/**
 * 离线 outbox：localStorage 队列。
 * 断网时 enqueue 暂存（clientRequestId 幂等键），恢复后 flush 逐条重放。
 */

const KEY = 'pinball_outbox';

type Listener = () => void;
const listeners = new Set<Listener>();

/** 订阅队列长度变化（enqueue / flush 后触发） */
export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

export interface OutboxItem {
  clientRequestId: string;
  payload: unknown;
  attempts: number;
}

function read(): OutboxItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as OutboxItem[];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueue(payload: unknown): string {
  const clientRequestId = crypto.randomUUID();
  const items = read();
  items.push({ clientRequestId, payload, attempts: 0 });
  write(items);
  notify();
  return clientRequestId;
}

export function pendingCount(): number {
  return read().length;
}

/** 逐条重放；成功出队，失败保留并退避 */
export async function flush(): Promise<{ sent: number; remaining: number }> {
  const items = read();
  if (items.length === 0) return { sent: 0, remaining: 0 };

  const rest: OutboxItem[] = [];
  let sent = 0;
  for (const item of items) {
    try {
      const res = await fetch('/api/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });
      if (res.ok) {
        sent += 1;
      } else {
        rest.push({ ...item, attempts: item.attempts + 1 });
      }
    } catch {
      rest.push({ ...item, attempts: item.attempts + 1 });
    }
  }
  write(rest);
  notify();
  return { sent, remaining: rest.length };
}

/** online 事件自动 flush（浏览器端调用一次注册） */
export function registerAutoSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onOnline = () => {
    if (navigator.onLine) void flush();
  };
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}
