'use client';

import { MULTIPLIERS } from '@/lib/rules';
import type { Multiplier } from '@/lib/types';
import { SELECTABLE_ACTIVE, SELECTABLE_BASE, SELECTABLE_IDLE } from '@/components/ui/styles';

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
            'min-h-16 rounded-xl text-xl font-bold',
            SELECTABLE_BASE,
            value === m ? SELECTABLE_ACTIVE : SELECTABLE_IDLE,
          ].join(' ')}
        >
          {m}×
        </button>
      ))}
    </div>
  );
}
