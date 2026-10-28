# Implement：统一前端组件规范与页面响应优化

执行顺序按「先基元、再迁移、后清理、每步可回退」组织。所有步骤在 `pinball/` 目录执行。

## 阶段 0：前置核对（写代码前）

- [ ] 读 `app/globals.css`，确认 `--accent` 实际色值 → 定 primary 前景色（`text-white` 还是 `text-[var(--surface)]`）
- [ ] `grep -rn "TouchButton"` 全量确认消费者（设计假设「极少使用」需复核）
- [ ] `grep -rn "@tanstack/react-virtual"` 确认是否仅 VirtualList 使用
- [ ] 读 `app/(app)/stats/page.tsx` 全文，核对 select 字段与 StatsCharts 消费字段差集
- [ ] 读 `tests/e2e/entry-flow.spec.ts`，确认 E2E 选择器是否依赖将被替换的 class

## 阶段 1：基元层（无行为变更，可独立回退）

- [ ] 新建 `components/ui/styles.ts`：导出 `SELECTABLE_BASE`、`INPUT_BASE`、`CARD_BASE` 等 class 常量
- [ ] **增强** `components/ui/TouchButton.tsx`（design §2.2：+`size: 'md'|'sm'` +`loading` 自动禁用与 Loader2 反馈；6 个现有消费者零改动）
- [ ] 新建 `components/ui/Input.tsx`（design §2.3）
- [ ] 新建 `components/ui/Card.tsx`（design §2.4）
- [ ] `pnpm typecheck` 通过（新文件零消费也应编译干净）

## 阶段 2：功能修复（与样式解耦，先行落地）

- [ ] R1：`app/(app)/settings/page.tsx` 抽出 `handleSignOut`，注销收尾复用之；新增「退出登录」按钮（ghost + LogOut 图标 + loading 禁用）
- [ ] R3c：`components/machine/MachineList.tsx` 删除防重（design §2.6c：deletingId 守卫 + 失败保持确认态）
- [ ] R3a：`app/(app)/stats/page.tsx` pnlTrend 前缀和 O(n) 化；顺手删 select 中未被消费字段（如有）
- [ ] R3b：新建 `app/(app)/stats/loading.tsx` 骨架屏（免责提示由服务端 page 渲染，不受影响）

## 阶段 3：样式迁移（逐文件，每文件后目视检查）

- [ ] `app/(auth)/login/page.tsx`、`register/page.tsx` → Input
- [ ] `components/machine/MachineForm.tsx` → Input + Button
- [ ] `components/machine/MachineList.tsx` → Button + Card
- [ ] `components/session/NewSessionButton.tsx` → Button loading
- [ ] `app/(app)/settings/page.tsx` → Button/Input/Card 全量替换手写 class
- [ ] `components/entry/PowerPicker.tsx`、`MultiplierPicker.tsx` → SELECTABLE_BASE 常量
- [ ] `components/entry/ExtraBetStepper.tsx` → SELECTABLE_BASE 常量（数字键保留自身尺寸）
- [ ] `components/entry/HoleBoard.tsx` → 共享基类常量（保留 rounded-full）

## 阶段 4：清理（单次提交，前置迁移全部完成）

- [ ] 删除 `components/ui/VirtualList.tsx`、`components/entry/MonteCarloPanel.tsx`
- [ ] 从 `package.json` 移除 `@tanstack/react-virtual`（仅 VirtualList 使用，grep 已确认）并更新锁文件
- [ ] `grep` 回归：旧样式字面量（`rounded-lg border border-\[var(--border)\] px-2 py-1 text-xs` 等设计清单中的模式）在被迁移文件中清零

## 阶段 5：测试

- [ ] 单测：pnlTrend 新旧对拍（同输入严格相等）；放入 `tests/` 既有统计相关文件或新建 `tests/stats-trend.test.ts`（纯函数对拍，无需 DB）
- [ ] E2E 新增 `tests/e2e/settings-and-perf.spec.ts`（或扩展既有 spec）：
  - 退出登录：登录 → /settings → 点退出 → URL 为 /login → 访问 / 被重定向
  - 统计 loading：throttle（CDP 或 route delay）下访问 /stats 观察到加载骨架
  - 删除防重：拦截 DELETE 请求，双击「确认」，断言计数 == 1
- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm playwright test tests/e2e/entry-flow.spec.ts`（回归）
- [ ] 手动 smoke：`pnpm dev` 逐页走查（机台/设置/新建/统计/录入），核对按钮触控尺寸 ≥48px、卡片背景一致、按压反馈统一

## 阶段 6：收尾

- [ ] 更新 `pinball/README.md` / `AGENTS.md` 中样式约定段落（如有「TouchButton 是统一按钮」类描述需改为 Button/Input/Card 基元）
- [ ] 删除一次性脚本/脚手架
- [ ] 提交（conventional prefix：`refactor(ui): 统一按钮输入卡片基元 + 设置页退出登录 + 统计页性能优化`）

## 回滚点

- 阶段 1 完成后：纯新增，随时可弃
- 阶段 2 完成后：功能修复独立可发布
- 阶段 3 每文件：单文件回退不影响其他
- 阶段 4：删除操作集中在最后，误删可 `git checkout` 恢复
