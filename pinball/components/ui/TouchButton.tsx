'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-white border-transparent',
  secondary: 'bg-[var(--surface)] text-[var(--fg)] border-[var(--border)]',
  ghost: 'bg-transparent text-[var(--fg)] border-transparent',
  danger: 'bg-[var(--error)] text-white border-transparent',
};

export interface TouchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  children: ReactNode;
}

/** ≥48px 基础大触控钮（移动端优先） */
export function TouchButton({
  variant = 'primary',
  block = false,
  className = '',
  children,
  ...rest
}: TouchButtonProps) {
  return (
    <button
      className={[
        'min-h-12 px-4 py-3 rounded-xl border text-base font-medium',
        'active:scale-[0.98] transition-transform disabled:opacity-50',
        VARIANTS[variant],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
