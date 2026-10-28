'use client';

import { MULTIPLIERS } from '@/lib/rules';
import type { Multiplier } from '@/lib/types';

export function MultiplierPicker({
  value,
  onChange,
}: {
  value: Multiplier | null;
  onChange: (m: Multiplier) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {MULTIPLIERS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={[
            'min-h-16 rounded-2xl border text-xl font-bold transition-transform active:scale-95',
            value === m
              ? 'border-transparent bg-[var(--accent)] text-white'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]',
          ].join(' ')}
        >
          {m}×
        </button>
      ))}
    </div>
  );
}
