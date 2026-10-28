'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, MonitorSmartphone, Settings } from 'lucide-react';

const TABS = [
  { href: '/', label: '机台', Icon: MonitorSmartphone },
  { href: '/stats', label: '统计', Icon: BarChart3 },
  { href: '/settings', label: '设置', Icon: Settings },
];

/** 全局底部导航：3 tab，当前页 aria-current 标记 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-[var(--border)] bg-[var(--surface)]"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${
              active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
            }`}
          >
            <Icon size={20} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
