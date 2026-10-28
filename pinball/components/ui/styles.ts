/**
 * 共享样式常量（Tailwind v4 + CSS 变量主题）。
 *
 * 存在理由：入口选择控件（倍率/发力）、数字键盘、洞位板、链接式按钮
 * 各有自身布局与语义，但圆角/边框/按压反馈/禁用态必须统一。
 * 组件消费这些常量而不是复制 class 字面量——改规范只改这一处。
 *
 * 新组件优先直接用 `Input` / `Card` / `TouchButton` 基元；
 * 这些常量服务于「有自身布局的领域控件」。
 */

/** 可选中按钮基座：边框 + 表面色 + 按压反馈（尺寸/圆角由调用方追加） */
export const SELECTABLE_BASE =
  'border transition-transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';

/** 未选中态 */
export const SELECTABLE_IDLE = 'border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]';

/** 选中态（accent 填充） */
export const SELECTABLE_ACTIVE = 'border-transparent bg-[var(--accent)] text-white';

/** 禁用态附加类（配合 SELECTABLE_BASE 的 disabled: 使用） */
export const SELECTABLE_DISABLED = 'cursor-not-allowed opacity-40';

/** 链接式按钮（<a> 伪装按钮，如导出链接）：与 TouchButton sm 视觉对齐 */
export const LINK_BUTTON =
  'inline-flex min-h-9 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--fg)] transition-transform active:scale-[0.98]';
