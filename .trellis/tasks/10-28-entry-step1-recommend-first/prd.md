# 发力与加注页重构：推荐置顶为焦点

## Goal

重构 `EntryWizard` step1（发力与加注页）：把发力推荐提升为页面焦点置顶显示，加注输入去掉冗余，发力三档置底且点选即前进。

## Requirements

### R1 页面结构（方案 A）
自上而下：**推荐卡** → **加注数字面板** → **发力三档按钮**。

### R2 推荐卡（置顶焦点）
- 展示推荐档位（大字，小力/中力/大力），Thompson 与点估计不一致时标注。
- 三档概率条（`bestArmProb`，推荐档高亮）。
- **亮灯联合命中**（`litHitProb`）与**期望返还**（`expectedReturn`）与三档概率同块紧凑布局（不再用占两行的独立网格卡片）。
- 12 通道落点概率热力条（`channelProb`），**亮灯通道用红点标记**。
- `degraded`/`mode === 'prior'` 时展示降级提示条。
- 推荐卡内联常驻，不再通过「查看发力推荐」按钮打开抽屉。

### R3 加注面板（去冗余）
- 删除「数字面板 / 步进微调」模式切换与步进器分支，只保留数字面板。
- 当前总珠数只有**一处**大字显示（原顶部卡片 + 输入回显重复）。
- 保留数字键盘、越界红框提示与范围说明。
- 输入语义不变：输入值为「本局总珠数」，换算 `extraBet = total - BASE_BET`，范围 `[0, MAX_EXTRA_BET]`。

### R4 发力三档
- 保持 `PowerPicker` 三档按钮，点击即 `setPower` + `setStep(2)`。
- 推荐档位角标保留（来自推荐卡数据）。

### R5 未解锁占位
- `overview.roundCount < SAMPLE_THRESHOLD` 时，推荐区位置显示「再录 N 局解锁发力推荐」，加注与发力照常可用。

### R6 数据透传
- `entry-store` 的 `recommendation` 类型补齐 `litHitProb`，`EntryWizard` 映射同步。
- 期望返还前端计算：`litHitProb × (BASE_BET + extraBet) × multiplier`（预取请求不带 totalBet，后端 `expectedReturn` 恒为 0，不采用）。
- 不改后端 `/api/recommend` 返回结构。

## Constraints

- 仅前端改动：`components/entry/*`、`lib/stores/entry-store.ts`。
- 不改判定规则、提交 payload、离线队列逻辑。
- 保持移动端（max-w-md、min-h-44px 触控目标）可用性。

## Acceptance Criteria

- [ ] step1 顶部即推荐卡；样本不足时该位置为「再录 N 局解锁」占位提示。
- [ ] 推荐卡内含推荐档位、三档概率、亮灯联合命中、期望返还、12 通道热力条，且亮灯通道有红点标记。
- [ ] 页面中「本局总珠数」大字只出现一次；无步进微调入口。
- [ ] 点击任一发档直接进入 3/3 落点页。
- [ ] `pnpm typecheck`、`pnpm lint`、`vitest`、Playwright `entry-flow.spec.ts` 全绿。
