# Component Guidelines

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

(To be filled by the team)

---

## Component Structure

<!-- Standard structure of a component file -->

(To be filled by the team)

---

## Props Conventions

<!-- How props should be defined and typed -->

(To be filled by the team)

---

## Styling Patterns

<!-- How styles are applied (CSS modules, styled-components, Tailwind, etc.) -->

(To be filled by the team)

---

## Accessibility

<!-- A11y requirements and patterns -->

(To be filled by the team)

---

## Common Mistakes

<!-- Component-related mistakes your team has made -->

### 交互组件不得「静默拒绝」用户操作

**反例**（`HoleBoard` 曾有此缺陷，导致「有些通道无法选择」的线上反馈）：

```tsx
function onClick(hole: number) {
  if (has) { onChange(value.filter((h) => h !== hole)); return; }
  if (maxSelect !== undefined && value.length >= maxSelect) return; // ❌ 静默丢弃
  onChange([...value, hole]);
}
```

达到上限后，按钮**仍渲染为可交互态**（无 `disabled`、无降级样式），用户点了却毫无反应。因为业务规则随参数变化（亮灯上限由倍率决定：2×→5、4×→4、6×→3、8×→2、10×→1），故障表现为「有时无法选择」，极难复现和定位。

**契约**：当某个操作因业务规则不可用时，必须让「不可用」本身可见。

1. **禁用态必须显式**：设 `disabled` + 视觉降级（`cursor-not-allowed` + `opacity-40`），不得保留可点击外观。
2. **禁用语义要可宣告**：`aria-label` 追注原因（如 `（已选满，不可用）`），屏幕阅读器与测试选择器都能拿到。
3. **取消路径必须保留**：已选中的项不能一起禁用，否则用户无法改选，被锁死在当前状态。
4. **附近要有文字解释**：在组件邻近的说明文字里追加原因（如「已选满，取消已选可更换」），不要只靠颜色传达。
5. **规则驱动的上限要从单一来源派生**：`atLimit` 由 props 计算，不要在组件内复制规则，避免口径漂移。

```tsx
const atLimit = !isLand && maxSelect !== undefined && value.length >= maxSelect;
const disabled = atLimit && !selected;   // 已选中项始终可点（支持取消）
```

**检测方法**：E2E 里对「不可用」路径断言 `isDisabled()`，而不是只断言主路径可用。仅测「能选中」测不出这类缺陷。
