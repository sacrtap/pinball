# PRD：统一前端组件规范与页面响应优化

## 背景

用户反馈三个问题（2026-10-28）：

1. 「设置」页面缺少**退出登录**按钮；
2. 「机台」和「设置」页、「新建机台」等页面中的按钮、输入框等组件**样式不一致**，需使用统一的前端 UI 框架/组件规范实现；
3. 「统计」页面首次进入很慢；「机台」页点击「新建机台」、删除等所有页面交互都需做好**响应优化**，避免重复触发造成的异常或压力。

已完成只读调研（结论见 `research/ui-survey.md`），以下需求基于调研事实。

## 需求

### R1 设置页退出登录

- 设置页新增「退出登录」按钮，位置醒目、语义与「注销账号（物理删除全部数据）」明确区分。
- 点击后清除登录态（JWT cookie 失效）并跳转登录页。
- 复用项目既有客户端先例：`next-auth/react` 的 `signOut({ redirect: false })` + 跳转（`app/(app)/settings/page.tsx:112-115` 现有注销流程同款）。
- 退出登录**不得**触碰任何数据，纯客户端会话操作；不需要服务端路由改动。

### R2 组件样式统一（前端 UI 规范）

- 不引入外部 UI 框架（无 arco-design / shadcn / radix / antd；项目现状 Tailwind v4 + CSS 变量主题，保持现状——引入框架属超范围重构）。
- 在 `components/ui/` 建立**统一基元组件**，覆盖三类当前最不一致的组件：
  - **按钮**：统一触控目标（`min-h-12` 移动端规范）、圆角、字号、按压反馈、变体（primary/secondary/ghost/danger）。现有 `TouchButton` 已是唯一统一按钮组件但**几乎无人使用**（设置页/入口选择/数字键盘全是手写 class），需评估：扩展 TouchButton 变体体系 or 新建语义化基元。
  - **输入框**：统一 `min-h-12`、`rounded-xl`、`bg-[var(--surface)]`、边框色。设置页当前小输入（`px-2 py-1 text-xs bg-transparent rounded-lg`）与大输入（MachineForm/login/register 用 `min-h-12 rounded-xl`）是两套。
  - **卡片容器**：统一 `rounded-xl border bg-[var(--surface)] p-*`；消除 `bg` 时有时无、`rounded-2xl` 偶发。
- 以下页面/组件全部迁移到统一基元（调研实测样式分裂清单）：
  - `app/(app)/settings/page.tsx`（手写小按钮 ×3 + 小输入 ×2 + 无 bg 卡片行）
  - `components/machine/MachineForm.tsx`、`MachineList.tsx`
  - `components/session/NewSessionButton.tsx`
  - 入口选择类：`components/entry/PowerPicker.tsx`、`MultiplierPicker.tsx`、`ExtraBetStepper.tsx`（大按钮变体，保留 `active:scale` 按压反馈语义）
  - 登录/注册页（`app/(auth)/login/page.tsx`、`register/page.tsx`）与登录态一致的输入样式
- 统一后**不改变任何组件的功能行为**：表单提交、删除确认、选择交互等逻辑不动，只替换 className/结构。
- 样式 token 仍全部走 CSS 变量（禁硬编码颜色的既有红线不动）。

### R3 响应与性能优化

- **统计页首次进入慢**：
  - 根因是服务端全量查库 + `force-dynamic` + 无 Suspense（`app/(app)/stats/page.tsx:14-26`）。
  - 优化方向（按优先级，设计阶段定稿）：
    a. 消除 `pnlTrend` 的 O(n²) 前缀和重算（`stats/page.tsx:48-54`）→ O(n)；
    b. 查询瘦身：只 select 图表实际需要的字段（现状已 select，需核对是否有富字段）；
    c. 加 `loading.tsx`（App Router 流式加载）让首屏不再白等全量数据——**注意合规红线**：loading 态不得移除「概率仅为统计估计」提示的最终呈现（DisclaimerBanner 在服务端页面渲染，loading 骨架不涉及）。
  - 不做：数据库加索引以外的大重构、缓存层引入（YAGNI，先测后加）。
- **删除机台防重**：`components/machine/MachineList.tsx:14-19` 的 `doDelete` 无 loading/busy 态，`confirmingId` 在 await 后才重置，快速双击「确认」可连发两次 DELETE。需加进行中禁用（参照 MachineForm 的 `loading + disabled` 既有模式）。
- **全页面交互响应审计**：调研已列出其余交互（新建机台/新建对局/录入提交）均有防重或服务端幂等兜底；本任务需逐项核对并在设计中留档，不需要改动未发现问题的路径。
- 全 app 无 `loading.tsx`/`error.tsx`：至少为统计页补 loading（性能主诉点）；其余页面按设计定稿决定是否补。

## 约束

- **合规红线**（AGENTS.md）：概率相关 UI 提示不得移除；不得新增资金/积分语义；跨用户聚合不变。
- 单仓单包，路径相对 `pinball/`；组件全部 `'use client'`。
- Tailwind v4 + CSS 变量主题体系不动，禁硬编码颜色。
- 移动端控件 `min-h-12`（48px 触控规范）既有约定需落实。
- 测试：Vitest 连真实 PG 串行；E2E 既有 `entry-flow.spec.ts` 不得回归。新 E2E 覆盖：退出登录流、统计页 loading 态呈现、删除机台防重（双击只发一次请求）。

## 验收标准

| # | 标准 | 验证方式 |
|---|---|---|
| A1 | 设置页存在「退出登录」按钮，点击后跳转 `/login` 且 JWT cookie 清除 | E2E：登录 → 设置 → 点退出 → 断言 URL `/login` + 受保护页不可达 |
| A2 | 机台/设置/新建机台/登录注册页的按钮、输入框、卡片全部来自统一基元组件，无手写重复 class | 代码审查 + grep 断言旧样式字面量清零 |
| A3 | 统一前后所有交互功能不回归（新建机台、删除、选择、表单提交） | `pnpm playwright test tests/e2e/entry-flow.spec.ts` + 既有 Vitest 全绿 |
| A4 | 统计页 `pnlTrend` 计算为 O(n)，且数值与旧实现逐点相等 | Vitest 单测：同输入新旧算法输出一致 |
| A5 | 统计页有 loading 反馈（导航到 /stats 不再无限白屏），免责提示仍在 | E2E 或手动：throttle 下访问 /stats 观察到骨架/加载态 |
| A6 | 删除机台双击「确认」只发出 1 次 DELETE 请求 | E2E：拦截请求计数 == 1 |
| A7 | `pnpm lint && pnpm typecheck && pnpm test` 全绿 | 命令输出 |
| A8 | 死代码（`components/ui/VirtualList.tsx`、`components/entry/MonteCarloPanel.tsx`，全项目无导入）随本轮清理或明确保留理由 | 设计定稿 + grep 无导入证据 |

## 非目标（Out of Scope）

- 不引入 shadcn/radix/arco 等外部 UI 框架。
- 不做数据库索引优化、Redis 缓存层、ISR/PPR 等架构级改造（除非设计阶段测得确有必要且小）。
- 不改任何 API 路由契约、Prisma schema、RLS 策略。
- 不动录入向导 EntryWizard 的核心交互逻辑（E2E 乱序点击约定防回归），仅样式迁移。
- 不重写 `docs/spec/` 三份权威文档；README/AGENTS.md 的样式约定段落顺手修正即可。
