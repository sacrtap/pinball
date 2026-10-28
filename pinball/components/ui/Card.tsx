'use client';

import type { HTMLAttributes } from 'react';

/** 统一卡片容器基元：rounded-xl + border + surface 背景 + p-3 */
export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3', className]
        .join(' ')
        .trim()}
      {...rest}
    />
  );
}
