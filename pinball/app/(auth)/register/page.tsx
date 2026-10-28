'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { TouchButton } from '@/components/ui/TouchButton';
import { Input } from '@/components/ui/Input';

type Step = 'form' | 'otp' | 'done';

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === 'EMAIL_TAKEN' ? '该邮箱已注册' : '注册失败，请检查输入');
      return;
    }
    setStep('otp');
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    setLoading(false);
    if (!res.ok) {
      setError('验证码错误或已过期');
      return;
    }
    setStep('done');
  }

  async function onLogin() {
    const res = await signIn('credentials', { email, password, redirect: false });
    if (res?.error) {
      setError('自动登录失败，请手动登录');
      return;
    }
    window.location.href = '/';
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">注册「幻想兔」</h1>
        <p className="text-sm text-[var(--muted)]">结果本质随机，历史统计不构成未来保证。</p>
      </header>

      {step === 'form' && (
        <form onSubmit={onRegister} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-[var(--muted)]">邮箱</span>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-[var(--muted)]">密码（≥8 位）</span>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-[var(--error)]">{error}</p>}
          <TouchButton type="submit" block disabled={loading}>
            {loading ? '提交中…' : '发送验证码'}
          </TouchButton>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={onVerify} className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            验证码已发送至 <b>{email}</b>（开发模式查看服务端控制台）。
          </p>
          <label className="block space-y-1">
            <span className="text-sm text-[var(--muted)]">6 位验证码</span>
            <Input
              inputMode="numeric"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="tracking-[0.5em] text-center"
            />
          </label>
          {error && <p className="text-sm text-[var(--error)]">{error}</p>}
          <TouchButton type="submit" block disabled={loading}>
            {loading ? '校验中…' : '验证并注册'}
          </TouchButton>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-3">
          <p className="text-[var(--success)]">注册成功！个人空间已创建。</p>
          <TouchButton block onClick={onLogin}>进入系统</TouchButton>
        </div>
      )}

      <p className="text-center text-sm text-[var(--muted)]">
        已有账号？<a href="/login" className="text-[var(--accent)]">登录</a>
      </p>
    </main>
  );
}
