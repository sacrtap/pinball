'use client';

import { HOLE_COUNT } from '@/lib/rules';

/**
 * 12 洞位板。mode='lit' 亮灯选择态（限定 maxSelect 个）；
 * mode='land' 落点态（单选，视觉区别于亮灯）。
 */
export function HoleBoard({
  mode,
  value,
  onChange,
  maxSelect,
}: {
  mode: 'lit' | 'land';
  value: number[];
  onChange: (holes: number[]) => void;
  maxSelect?: number;
}) {
  const holes = Array.from({ length: HOLE_COUNT }, (_, i) => i + 1);
  const isLand = mode === 'land';

  function onClick(hole: number) {
    if (isLand) {
      onChange([hole]);
      return;
    }
    const has = value.includes(hole);
    if (has) {
      onChange(value.filter((h) => h !== hole));
      return;
    }
    if (maxSelect !== undefined && value.length >= maxSelect) return;
    onChange([...value, hole].sort((a, b) => a - b));
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {holes.map((hole) => {
        const selected = value.includes(hole);
        return (
          <button
            key={hole}
            type="button"
            onClick={() => onClick(hole)}
            aria-pressed={selected}
            aria-label={`${isLand ? '落点' : '亮灯'} ${hole} 号洞`}
            className={[
              'min-h-14 rounded-full border text-lg font-bold transition-transform active:scale-95',
              selected
                ? isLand
                  ? 'border-transparent bg-[var(--warning)] text-white' // 落点态：橙
                  : 'border-transparent bg-[var(--c1)] text-white' // 亮灯态：靛蓝
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]',
            ].join(' ')}
          >
            {hole}
          </button>
        );
      })}
    </div>
  );
}
