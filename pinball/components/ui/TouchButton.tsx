'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-white border-transparent',
  secondary: 'bg-[var(--surface)] text-[var(--fg)] border-[var(--border)]',
  ghost: 'bg-transparent text-[var(--fg)] border-transparent',
  danger: 'bg-transparent text-[var(--error)] border-[var(--error)]',
};

const SIZES: Record<Size, string> = {
  // md：移动端主操作，≥48px 触控目标
  md: 'min-h-12 px-4 py-3 text-base',
  // sm：行内次要操作（设置页切换/移除/邀请等），仍保持 36px 可点区域
  sm: 'min-h-9 px-3 py-1.5 text-sm',
};

export interface TouchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** md=大触控钮（默认）；sm=行内次要操作 */
  size?: Size;
  block?: boolean;
  /** 进行中：自动禁用 + Loader2 图标 + aria-busy，防重复触发 */
  loading?: boolean;
  children: ReactNode;
}

/** 统一按钮基元：≥48px（md）大触控，4 变体 × 2 尺寸 × loading 态 */
export function TouchButton({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: TouchButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl border font-medium',
        'transition-transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        SIZES[size],
        VARIANTS[variant],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
