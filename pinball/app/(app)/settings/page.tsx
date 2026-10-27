'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';

interface TenantRow {
  id: string;
  name: string;
  role: string;
  current: boolean;
}

interface MemberRow {
  userId: string;
  email: string;
  role: string;
}

export default function SettingsPage() {
  const { update } = useSession();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [newTeam, setNewTeam] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadTenants = useCallback(async () => {
    const res = await fetch('/api/tenants');
    if (!res.ok) return;
    const data = await res.json();
    setTenants(data.tenants ?? []);
    setActiveId(data.tenants?.find((t: TenantRow) => t.current)?.id ?? null);
  }, []);

  const loadMembers = useCallback(async (tenantId: string) => {
    const res = await fetch(`/api/tenants/${tenantId}/members`);
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members ?? []);
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (activeId) void loadMembers(activeId);
  }, [activeId, loadMembers]);

  async function createTeam() {
    if (!newTeam.trim()) return;
    setBusy(true);
    await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTeam.trim() }),
    });
    setNewTeam('');
    await loadTenants();
    setBusy(false);
  }

  async function switchTenant(tenantId: string) {
    setBusy(true);
    const res = await fetch('/api/auth/switch-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId }),
    });
    if (res.ok) {
      await update({ tenantId });
      window.location.reload();
    }
    setBusy(false);
  }

  async function invite() {
    if (!activeId || !inviteEmail.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/tenants/${activeId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setInviteLink(`${window.location.origin}${data.acceptUrl}`);
    }
    setInviteEmail('');
    setBusy(false);
  }

  async function removeMember(userId: string) {
    if (!activeId) return;
    setBusy(true);
    await fetch(`/api/tenants/${activeId}/members?userId=${userId}`, { method: 'DELETE' });
    await loadMembers(activeId);
    setBusy(false);
  }

  async function deleteAccount() {
    setBusy(true);
    await fetch('/api/account/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    // 清除 JWT cookie，使旧 token 立即失效（服务端数据已物理删除）
    await signOut({ redirect: false });
    window.location.href = '/login';
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 space-y-6">
      <h1 className="text-lg font-bold">设置</h1>

      <DisclaimerBanner />

      {/* 租户切换 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">我的租户</h2>
        {tenants.map((t) => (
          <div
            key={t.id}
            className={`flex items-center justify-between rounded-xl border p-2 text-xs ${
              t.current ? 'border-[var(--accent)]' : 'border-[var(--border)]'
            }`}
          >
            <div>
              <div className="font-bold">{t.name}</div>
              <div className="text-[var(--muted)]">{t.role}</div>
            </div>
            {!t.current && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void switchTenant(t.id)}
                className="rounded-lg border border-[var(--border)] px-2 py-1"
              >
                切换
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
            placeholder="新团队名称"
            className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={busy || !newTeam.trim()}
            onClick={() => void createTeam()}
            className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs text-[var(--surface)]"
          >
            创建团队
          </button>
        </div>
      </section>

      {/* 成员管理 */}
      {activeId && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">成员</h2>
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between rounded-xl border border-[var(--border)] p-2 text-xs">
              <div>
                <div className="font-bold">{m.email}</div>
                <div className="text-[var(--muted)]">{m.role}</div>
              </div>
              {m.role !== 'owner' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeMember(m.userId)}
                  className="text-[var(--error)]"
                >
                  移除
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="邀请邮箱"
              className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={busy || !inviteEmail.trim()}
              onClick={() => void invite()}
              className="rounded-lg border border-[var(--border)] px-3 py-1"
            >
              邀请
            </button>
          </div>
          {inviteLink && (
            <p className="break-all rounded-lg border border-[var(--border)] p-2 text-[10px] text-[var(--muted)]">
              邀请链接（7 天有效）：{inviteLink}
            </p>
          )}
        </section>
      )}

      {/* 导出 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">数据导出</h2>
        <div className="flex gap-2">
          <a
            href="/api/export"
            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs"
          >
            导出 JSON
          </a>
          <a
            href="/api/export?format=csv"
            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs"
          >
            导出 CSV
          </a>
        </div>
      </section>

      {/* 注销 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--error)]">危险操作</h2>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-[var(--error)] px-3 py-1 text-xs text-[var(--error)]"
          >
            注销账号（物理删除全部数据）
          </button>
        ) : (
          <div className="space-y-2 rounded-xl border border-[var(--error)] p-3 text-xs">
            <p>此操作将物理删除你的账号与全部机台/对局/统计数据，不可恢复。</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void deleteAccount()}
                className="rounded-lg bg-[var(--error)] px-3 py-1 text-[var(--surface)]"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
