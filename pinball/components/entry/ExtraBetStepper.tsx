'use client';

import { BASE_BET, MAX_EXTRA_BET } from '@/lib/rules';

export function ExtraBetStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        aria-label="减少加注"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        className="min-h-14 w-14 rounded-full border border-[var(--border)] text-2xl disabled:opacity-40"
      >
        −
      </button>
      <div className="min-w-24 text-center">
        <div className="text-3xl font-bold">+{value}</div>
        <div className="text-xs text-[var(--muted)]">
          投入 {BASE_BET} + 加注 {value} = {BASE_BET + value}
        </div>
      </div>
      <button
        type="button"
        aria-label="增加加注"
        onClick={() => onChange(Math.min(MAX_EXTRA_BET, value + 1))}
        disabled={value >= MAX_EXTRA_BET}
        className="min-h-14 w-14 rounded-full border border-[var(--border)] text-2xl disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
