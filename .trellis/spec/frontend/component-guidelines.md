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

## UI 基元契约（2026-10-28 起强制）

项目**不引入外部 UI 框架**（无 arco/shadcn/radix；Tailwind v4 + CSS 变量是唯一样式体系）。统一靠 `components/ui/` 基元层收敛，不靠口头约定。

### 基元清单与选型规则

| 需求 | 用什么 | 禁止 |
| --- | --- | --- |
| 按钮 | `TouchButton`（`variant` × `size` × `loading`） | 手写 `<button className="rounded-lg border …">` |
| 输入框 | `Input`（`invalid` 错误态） | 手写 `<input className="min-h-12 …">` |
| 卡片容器 | `Card` | 手写 `<div className="rounded-xl border …">` |
| 有自身布局的领域控件 | `styles.ts` 常量（`SELECTABLE_BASE`/`SELECTABLE_IDLE`/`SELECTABLE_ACTIVE`/`SELECTABLE_DISABLED`/`LINK_BUTTON`） | 复制 class 字面量 |

领域控件（倍率/发力选择、数字键盘、洞位板、`<a>` 链接按钮）**不并入 TouchButton**——它们自含选中态、布局、无障碍语义，并入会让基元膨胀成万能组件。正确做法是引用共享样式常量，保留各自布局。

### 异步交互必须防重

fetch 进行中一律 `loading`/`disabled` 或 `if (busy) return` 守卫。删除类操作失败时**保持确认态**允许重试，不静默吞错（`MachineList.doDelete` 曾无防重，双击「确认」连发两次 DELETE）。

### 扩展优先于新建

`TouchButton` 已有 6 个消费者时，正确动作是**给它加 `size`/`loading`**，而不是新建 `Button` 再迁移 6 处。动手前先 `grep` 消费者数量再决定扩展还是替换。

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

### E2E 步骤断言必须锚定「控件」而非「标题文本」

**实例**（2026-10-28 修复，断裂源自 `afe0758`）：`EntryWizard` 的步骤指示原为
`{step + 1}/3 {STEP_TITLES[step]}`，后改为纯 `STEP_TITLES` 条（无序号前缀），
但 `entry-flow.spec.ts` 的 6 处断言仍写 `text=2/3 发力与加注` —— 全部失效。
该 E2E 从此处于**红色但无人发现**的状态，直到本轮跑全量 Playwright 才暴露。

**契约**：断言步骤/状态时，锚定**该步骤独有的控件**（如 step1 的数字键盘
`button[aria-label="清空"]`、step2 的落点板 `button[aria-label="落点 N 号洞"]`），
并同时断言**其他步骤的控件不存在**（`toHaveCount(0)`）。标题文案是展示层，
改版首当其冲；控件存在性是行为层，与步骤状态一一对应。

**配套规则**：改任何组件结构/文案后，跑一次**全量** E2E，不能只跑改动的那个
spec——同文件内的交叉断言就是靠全量运行才暴露的。

### 浮点重构必须对拍，且中间步骤要一致

**实例**（2026-10-28，`pnlTrend` O(n²)→O(n)）：旧实现
`slice(0, i+1).reduce((s, x) => s + x.reward - x.totalBet, 0)` 每步是
`(s + reward) - bet`；直觉写法 `acc += reward - bet` 每步变成
`acc + (reward - bet)` —— **IEEE754 下结果不同**（实测某点 `96.19` vs
`96.19000000000001`）。`tests/evaluate-pnl.test.ts` 的 1000 局对拍 + 0.1
累加敏感用例抓到了它。

**契约**：任何「等价重构」先写对拍测试（新实现 vs 旧实现字面复刻）再动手；
累加/累减混合表达式保持**逐步一致**，不要凭「数学上等价」重排运算顺序。
