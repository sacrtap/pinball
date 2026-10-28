'use client';

import { useEffect, useState } from 'react';
import { BASE_BET, MAX_EXTRA_BET } from '@/lib/rules';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '清空', '0', '删除'];

/**
 * 加注步骤。默认展示数字面板，可直接输入本局总珠数（含基础投入）；
 * 也可切到步进器做 ±1 微调。输入总珠数后换算为加注值：
 *   extraBet = total - BASE_BET，范围 [0, MAX_EXTRA_BET]
 */
export function ExtraBetStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [mode, setMode] = useState<'keypad' | 'stepper'>('keypad');
  // 面板上的输入缓冲（字符串，便于处理前导 0 与清空态）
  const [buffer, setBuffer] = useState(() => String(BASE_BET + value));
  // true 表示 buffer 还是同步来的当前值，用户尚未开始输入：
  // 此时按数字键应直接开新输入，而不是把数字接在当前值后面
  const [editing, setEditing] = useState(false);

  // 外部值变化（如重置开下一局）时同步面板
  useEffect(() => {
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

  function commit(n: number) {
    onChange(Math.min(MAX_EXTRA_BET, Math.max(0, n - BASE_BET)));
  }

  return (
    <div className="space-y-3">
      {/* 当前总珠数 + 构成说明 */}
      <div className="rounded-xl border border-[var(--border)] p-3 text-center">
        <div className="text-4xl font-bold tabular-nums">{BASE_BET + value}</div>
        <div className="mt-1 text-xs text-[var(--muted)]">
          本局总珠数 = 基础 {BASE_BET} + 加注 {value}
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">
          可加注范围 {BASE_BET} ~ {BASE_BET + MAX_EXTRA_BET} 珠
        </div>
      </div>

      {/* 模式切换 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('keypad')}
          aria-pressed={mode === 'keypad'}
          className={`min-h-11 flex-1 rounded-xl border text-sm font-medium ${
            mode === 'keypad'
              ? 'border-transparent bg-[var(--accent)] text-white'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]'
          }`}
        >
          数字面板
        </button>
        <button
          type="button"
          onClick={() => setMode('stepper')}
          aria-pressed={mode === 'stepper'}
          className={`min-h-11 flex-1 rounded-xl border text-sm font-medium ${
            mode === 'stepper'
              ? 'border-transparent bg-[var(--accent)] text-white'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]'
          }`}
        >
          步进微调
        </button>
      </div>

      {mode === 'keypad' ? (
        <>
          {/* 输入回显 */}
          <div
            className={`rounded-xl border p-3 text-center text-3xl font-bold tabular-nums ${
              outOfRange ? 'border-[var(--error)] text-[var(--error)]' : 'border-[var(--border)]'
            }`}
            aria-live="polite"
          >
            {buffer === '' ? <span className="text-[var(--muted)]">输入总珠数</span> : total}
          </div>
          {outOfRange && (
            <p className="text-center text-xs text-[var(--error)]">
              总珠数需在 {BASE_BET} ~ {BASE_BET + MAX_EXTRA_BET} 之间
            </p>
          )}

          {/* 数字键盘 */}
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                aria-label={k}
                className={`min-h-14 rounded-xl border text-xl font-bold active:scale-95 ${
                  k === '清空' || k === '删除'
                    ? 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]'
                }`}
              >
                {k === '删除' ? '⌫' : k}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => commit(total)}
            disabled={buffer === '' || outOfRange}
            className="min-h-14 w-full rounded-xl border border-transparent bg-[var(--accent)] text-lg font-bold text-white disabled:opacity-40"
          >
            确认 {BASE_BET + value} 珠
          </button>
        </>
      ) : (
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
            <div className="text-3xl font-bold tabular-nums">{BASE_BET + value}</div>
            <div className="text-xs text-[var(--muted)]">加注 {value}</div>
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
      )}
    </div>
  );
}
