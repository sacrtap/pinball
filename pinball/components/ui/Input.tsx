'use client';

import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 错误态：边框变 error 色（调用方仍负责错误文案） */
  invalid?: boolean;
}

/** 统一输入框基元：min-h-12 触控、rounded-xl、surface 背景 */
export function Input({ invalid = false, className = '', ...rest }: InputProps) {
  return (
    <input
      className={[
        'min-h-12 w-full rounded-xl border bg-[var(--surface)] px-3 text-base text-[var(--fg)]',
        'placeholder:text-[var(--muted)]',
        invalid ? 'border-[var(--error)]' : 'border-[var(--border)]',
        className,
      ].join(' ')}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
