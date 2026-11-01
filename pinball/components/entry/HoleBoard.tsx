'use client';

import { HOLE_COUNT } from '@/lib/rules';
import { SELECTABLE_BASE, SELECTABLE_DISABLED, SELECTABLE_IDLE } from '@/components/ui/styles';

/**
 * 12 洞位板。mode='lit' 亮灯选择态（上限 maxSelect 个）；mode='land' 落点态（单选）。
 *
 * 亮灯数量是区间 `[1, maxSelect]`：未选满也能继续，达到上限后未选中的洞位
 * 显式禁用——保留可点击外观却静默忽略会变成「有的通道点了没反应」。
 *
 * onChange 上报 hole：用户本次点击的洞位。**不要**让调用方从 holes
 * 数组反推用户点了哪个——数组经排序，最后一个元素未必是点击目标。
 */
export function HoleBoard({
  mode,
  value,
  onChange,
  maxSelect,
}: {
  mode: 'lit' | 'land';
  value: number[];
  onChange: (hole: number) => void;
  maxSelect?: number;
}) {
  const holes = Array.from({ length: HOLE_COUNT }, (_, i) => i + 1);
  const isLand = mode === 'land';
  // 亮灯态达到上限：未选中的洞位禁用，已选中的始终可点（用于取消）
  const atLimit = !isLand && maxSelect !== undefined && value.length >= maxSelect;

  function onClick(hole: number) {
    if (isLand) {
      onChange(hole);
      return;
    }
    if (atLimit && !value.includes(hole)) return;
    onChange(hole);
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {holes.map((hole) => {
        const selected = value.includes(hole);
        const disabled = atLimit && !selected;
        return (
          <button
            key={hole}
            type="button"
            onClick={() => onClick(hole)}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={`${isLand ? '落点' : '亮灯'} ${hole} 号洞${disabled ? '（已选满，不可用）' : ''}`}
            className={[
              'min-h-14 rounded-full text-lg font-bold',
              SELECTABLE_BASE,
              disabled && SELECTABLE_DISABLED,
              selected
                ? isLand
                  ? 'border-transparent bg-[var(--warning)] text-white' // 落点态：橙
                  : 'border-transparent bg-[var(--c1)] text-white' // 亮灯态：靛蓝
                : `${SELECTABLE_IDLE} text-[var(--muted)]`,
            ].join(' ')}
          >
            {hole}
          </button>
        );
      })}
    </div>
  );
}
