'use client';

import { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import { TouchButton } from '@/components/ui/TouchButton';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { LINK_BUTTON } from '@/components/ui/styles';

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
  const [signingOut, setSigningOut] = useState(false);
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

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    // 清除 JWT cookie，使旧 token 立即失效，然后回登录页
    await signOut({ redirect: false });
    window.location.href = '/login';
  }

  async function deleteAccount() {
    setBusy(true);
    await fetch('/api/account/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    // 服务端数据已物理删除，收尾同样走登出清 cookie
    await handleSignOut();
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 space-y-6">
      <h1 className="text-lg font-bold">设置</h1>

      <DisclaimerBanner />

      {/* 我的租户 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">我的租户</h2>
        {tenants.map((t) => (
          <Card
            key={t.id}
            className={`flex items-center justify-between p-2 text-xs ${
              t.current ? 'border-[var(--accent)]' : ''
            }`}
          >
            <div>
              <div className="font-bold">{t.name}</div>
              <div className="text-[var(--muted)]">{t.role}</div>
            </div>
            {!t.current && (
              <TouchButton
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void switchTenant(t.id)}
              >
                切换
              </TouchButton>
            )}
          </Card>
        ))}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              value={newTeam}
              onChange={(e) => setNewTeam(e.target.value)}
              placeholder="新团队名称"
              aria-label="新团队名称"
            />
          </div>
          <TouchButton
            disabled={busy || !newTeam.trim()}
            onClick={() => void createTeam()}
            loading={busy}
            className="shrink-0"
          >
            创建团队
          </TouchButton>
        </div>
      </section>

      {/* 成员管理 */}
      {activeId && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">成员</h2>
          {members.map((m) => (
            <Card key={m.userId} className="flex items-center justify-between p-2 text-xs">
              <div>
                <div className="font-bold">{m.email}</div>
                <div className="text-[var(--muted)]">{m.role}</div>
              </div>
              {m.role !== 'owner' && (
                <TouchButton variant="danger" size="sm" disabled={busy} onClick={() => void removeMember(m.userId)}>
                  移除
                </TouchButton>
              )}
            </Card>
          ))}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="邀请邮箱"
                aria-label="邀请邮箱"
              />
            </div>
            <TouchButton
              disabled={busy || !inviteEmail.trim()}
              onClick={() => void invite()}
              loading={busy}
              className="shrink-0"
            >
              邀请
            </TouchButton>
          </div>
          {inviteLink && (
            <p className="break-all rounded-xl border border-[var(--border)] p-2 text-[10px] text-[var(--muted)]">
              邀请链接（7 天有效）：{inviteLink}
            </p>
          )}
        </section>
      )}

      {/* 数据导出 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">数据导出</h2>
        <div className="flex gap-2">
          <a href="/api/export" className={LINK_BUTTON}>
            导出 JSON
          </a>
          <a href="/api/export?format=csv" className={LINK_BUTTON}>
            导出 CSV
          </a>
        </div>
      </section>

      {/* 退出登录：纯会话操作，不触碰任何数据 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">账号</h2>
        <TouchButton
          variant="secondary"
          onClick={() => void handleSignOut()}
          loading={signingOut}
        >
          <LogOut aria-hidden className="size-4" />
          退出登录
        </TouchButton>
      </section>

      {/* 危险操作 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--error)]">危险操作</h2>
        {!confirmDelete ? (
          <TouchButton variant="danger" onClick={() => setConfirmDelete(true)}>
            注销账号（物理删除全部数据）
          </TouchButton>
        ) : (
          <Card className="space-y-2 border-[var(--error)] text-xs">
            <p>此操作将物理删除你的账号与全部机台/对局/统计数据，不可恢复。</p>
            <div className="flex gap-2">
              <TouchButton variant="danger" size="sm" disabled={busy} onClick={() => void deleteAccount()} loading={busy}>
                确认删除
              </TouchButton>
              <TouchButton variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
                取消
              </TouchButton>
            </div>
          </Card>
        )}
      </section>
    </main>
  );
}
