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

### 数值展示必须匹配业务语义：统计量与离散值不可混用标签

**反例**（`RecommendCard` 曾有此缺陷，用户反馈「返还怎么会有小数点」）：

```tsx
// ❌ 把概率加权期望（连续值）当「返还」展示
const expectedReturn = hitProb * totalBet * multiplier; // 0.65 × 5 × 2 = 6.5
<dd>{expectedReturn.toFixed(1)}</dd>  // 显示「返还 6.5」
```

弹珠机单局只有中奖/不中奖两种结果，奖励是离散值（`totalBet × multiplier` 或 0）。但「期望返还」是 `命中率 × 奖励` 的概率加权统计量，产生小数。用「返还」标签展示统计量，让用户误以为单局会返还 6.5 珠——实际要么中 10 珠要么 0 珠，不存在 6.5。

**契约**：UI 展示的每个数值，其**业务语义**和**数学性质**必须一致。

1. **离散业务量用整数**：中奖奖励、投入珠数、局数等计数型量，展示整数（`Math.round` 或天然整数运算）。
2. **统计量标注清楚**：命中率、期望值等概率型量，用百分比或保留小数，但**标签必须区分**（如「命中率」而非「命中」，「期望返还」而非「返还」）。
3. **不混用一词**：「返还」「命中」等词在同一个卡片内只能指代一种语义。统计量和业务量分列展示时，标签不可重叠。
4. **后端接口分层**：`RecommendResult` 含 `expectedReturn`（统计量）和 `litHitProb`（概率），但缺少 `reward`（离散奖励）。前端自行 `totalBet × multiplier` 计算离散值。新增展示需求时，优先确认接口是否已提供对应语义的字段，避免误用统计量替代。

```tsx
// ✓ 离散奖励用整数，统计量用百分比，标签区分
const reward = totalBet * multiplier;          // 整数
<dt>中奖</dt><dd>{reward}</dd>                 // 「中奖 10」
<dt>命中率</dt><dd>{(hitProb * 100).toFixed(1)}%</dd>  // 「命中率 65.0%」
```

**检测方法**：review 时对每个展示数值问「这个值的业务含义是什么？是计数还是概率？标签是否准确？」。若值为小数但业务语义是离散计数，必有问题。
