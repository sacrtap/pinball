'use client';

import { useEffect, useRef, useState } from 'react';
import { BASE_BET, MAX_EXTRA_BET } from '@/lib/rules';
import { SELECTABLE_BASE, SELECTABLE_IDLE } from '@/components/ui/styles';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '清空', '0', '删除'];

/**
 * 加注步骤：数字面板直接输入本局总珠数（含基础投入）。
 * 换算：extraBet = total - BASE_BET，范围 [0, MAX_EXTRA_BET]
 */
export function ExtraBetStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  // 面板上的输入缓冲（字符串，便于处理前导 0 与清空态）
  const [buffer, setBuffer] = useState(() => String(BASE_BET + value));
  // true 表示 buffer 还是同步来的当前值，用户尚未开始输入：
  // 此时按数字键应直接开新输入，而不是把数字接在当前值后面
  const [editing, setEditing] = useState(false);

  // 最近一次由本组件写入 store 的 extraBet：用于区分「外部值变化」与「自身输入引起的 value 变化」
  const lastEmitted = useRef(value);

  // 面板输入实时同步 store：空/越界保持上次有效值（红框提示由下方渲染负责）
  useEffect(() => {
    if (buffer === '') return;
    const parsed = Number.parseInt(buffer, 10);
    const total = Number.isNaN(parsed) ? BASE_BET : parsed;
    if (total < BASE_BET || total > BASE_BET + MAX_EXTRA_BET) return;
    lastEmitted.current = total - BASE_BET;
    onChange(total - BASE_BET);
  }, [buffer, onChange]);

  // 外部值变化（重置开下一局）时同步面板；自身输入不回写，避免打断连续输入
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setBuffer(String(BASE_BET + value));
    setEditing(false);
  }, [value]);

  const parsed = Number.parseInt(buffer, 10);
  const total = Number.isNaN(parsed) ? BASE_BET : parsed;
  const outOfRange = total < BASE_BET || total > BASE_BET + MAX_EXTRA_BET;

  function press(key: string) {
    if (key === '清空') {
      setBuffer('');
      setEditing(true);
      return;
    }
    if (key === '删除') {
      // 尚未编辑时删除初值：清空而不是删成空串前的中间态
      if (!editing) {
        setBuffer('');
        setEditing(true);
        return;
      }
      setBuffer((b) => b.slice(0, -1));
      return;
    }
    // 数字键：首次输入直接开新值，避免把数字接在当前值后面（如 5 → 51）
    setBuffer((b) => {
      const base = editing ? b : '';
      const next = (base === '0' ? '' : base) + key;
      // 总珠数上限 BASE_BET + MAX_EXTRA_BET，限制输入位数
      return next.length > String(BASE_BET + MAX_EXTRA_BET).length ? base : next;
    });
    setEditing(true);
  }

  return (
    <div className="space-y-2">
      {/* 唯一珠数显示：输入即当前总珠数 */}
      <div
        className={`rounded-xl border p-2 text-center ${
          outOfRange ? 'border-[var(--error)]' : 'border-[var(--border)]'
        }`}
        aria-live="polite"
      >
        <div className="text-xs text-[var(--muted)]">本局总珠数</div>
        <div
          className={`text-2xl font-bold tabular-nums ${
            outOfRange ? 'text-[var(--error)]' : 'text-[var(--fg)]'
          }`}
        >
          {buffer === '' ? <span className="text-[var(--muted)]">输入总珠数</span> : total}
        </div>
        <div className="text-xs text-[var(--muted)]">
          基础 {BASE_BET} + 加注 {value} · 可输入 {BASE_BET} ~ {BASE_BET + MAX_EXTRA_BET} 珠
        </div>
        {outOfRange && (
          <p className="text-xs text-[var(--error)]">
            总珠数需在 {BASE_BET} ~ {BASE_BET + MAX_EXTRA_BET} 之间
          </p>
        )}
      </div>

      {/* 数字键盘（紧凑布局） */}
      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k}
            className={[
              'min-h-10 rounded-lg text-lg font-bold',
              SELECTABLE_BASE,
              SELECTABLE_IDLE,
              k === '清空' || k === '删除' ? 'text-[var(--muted)]' : '',
            ].join(' ')}
          >
            {k === '删除' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  );
}
