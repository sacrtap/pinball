'use client';

import { POWER_LEVELS } from '@/lib/rules';
import type { PowerLevel } from '@/lib/types';
import { SELECTABLE_ACTIVE, SELECTABLE_BASE, SELECTABLE_IDLE } from '@/components/ui/styles';

const LABELS: Record<PowerLevel, string> = { low: '小力', mid: '中力', high: '大力' };

export function PowerPicker({
  value,
  onChange,
  recommended,
}: {
  value: PowerLevel | null;
  onChange: (p: PowerLevel) => void;
  recommended?: PowerLevel | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {POWER_LEVELS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={[
            'relative min-h-20 rounded-xl text-lg font-bold',
            SELECTABLE_BASE,
            value === p ? SELECTABLE_ACTIVE : SELECTABLE_IDLE,
          ].join(' ')}
        >
          {LABELS[p]}
          {recommended === p && (
            <span className="absolute -top-1 -right-1 rounded-full bg-[var(--success)] px-1.5 py-0.5 text-[10px] text-white">
              推荐
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
