'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { TouchButton } from '@/components/ui/TouchButton';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError('邮箱或密码错误');
      return;
    }
    window.location.href = '/';
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">登录「幻想兔」</h1>
        <p className="text-sm text-[var(--muted)]">结果本质随机，历史统计不构成未来保证。</p>
      </header>

      <form onSubmit={onCredentials} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm text-[var(--muted)]">邮箱</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-[var(--muted)]">密码</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3"
          />
        </label>
        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        <TouchButton type="submit" block disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </TouchButton>
      </form>

      <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        或
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <div className="space-y-2">
        {process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true' && (
          <TouchButton variant="secondary" block onClick={() => signIn('google')}>
            Google 登录
          </TouchButton>
        )}
        {process.env.NEXT_PUBLIC_AUTH_GITHUB_ENABLED === 'true' && (
          <TouchButton variant="secondary" block onClick={() => signIn('github')}>
            GitHub 登录
          </TouchButton>
        )}
      </div>

      <p className="text-center text-sm text-[var(--muted)]">
        还没有账号？<a href="/register" className="text-[var(--accent)]">注册</a>
      </p>
    </main>
  );
}
