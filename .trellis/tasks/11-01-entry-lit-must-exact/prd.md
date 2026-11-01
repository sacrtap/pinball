# 亮灯通道改为「最多 N 个」并可未选满继续

## Goal

录入第 1 步「倍率与亮灯」中，亮灯通道数量应是**区间 `[1, LIT_COUNT[multiplier]]`**：每个倍率至少选 1 个、最多 N 个（2×→5、4×→4、6×→3、8×→2、10×→1）；**未选满也能点「确定」进入下一步**。修复前该步被实现成必须恰好 N 个，未选满时「确定」禁用，等于把上限当成了必须量。

## Background

倍率 → 亮灯上限为固定映射（`lib/rules.ts:13`）。机台每局亮灯数由倍率决定上限，但录入时不强制凑满（用户可能未记全或只需记录关键通道），因此数量语义是上限而非必须量。

已在本地 dev（:8477，dev 账号，390×844）实测的现状与目标对照：

| 场景 | 修复前（必须量） | 目标（上限） |
|---|---|---|
| 2× 只选 2 个 | 「确定」禁用 | 「确定」可用 |
| 2× 选满 5 个 | 未选项可点并替换 | 未选项显式禁用，取消已选可更换 |
| 10× 选 1 个 | 未选项可点并整体替换 | 其余 11 个禁用 |
| 任意倍率 0 个 | 禁用 | 禁用（至少 1 个） |

代码证据：

| 位置 | 修复前 | 问题 |
|---|---|---|
| `pinball/lib/rules.ts` | `litHolesError` 要求 `length === litCountFor(multiplier)` | 必须量语义 |
| `pinball/lib/stores/entry-store.ts` | 满额时 FIFO 替换 | 数量恒定，无法出现未满状态 |
| `pinball/components/entry/HoleBoard.tsx` | 无 `maxSelect`，选满后仍可点 | 上限不可见，点击即替换 |
| `pinball/components/entry/EntryWizard.tsx` | 提示「必须选满 N 个」、确定按钮 `length !== N` 禁用 | 未选满无法前进 |
| `pinball/app/api/rounds/[id]/route.ts` | 已加 `litHolesError` 校验（语义随规则变化） | — |
| `pinball/app/api/recommend/route.ts` | 要求 `length === litCountFor(multiplier)` | 未满时推荐接口 400，step1 无法出推荐 |

## Requirements

### R1 数量规则：区间而非定值

- `lib/rules.ts` 的 `litHolesError(multiplier, litHoles)` 改为区间校验：`length < 1` → 「至少选择 1 个亮灯通道」；`length > LIT_COUNT[multiplier]` → 「倍率 X 最多 N 个亮灯通道」；再校验去重与 1..12 范围。
- 合法返回 `null`，否则返回中文消息，供 `RoundInputSchema` 与 PATCH 路由共用。

### R2 选择态组件：上限可见

- `HoleBoard` 亮灯态恢复 `maxSelect`：达到上限后未选中的洞位 `disabled` + 视觉降级（`SELECTABLE_DISABLED`），`aria-label` 追注「（已选满，不可用）」。
- 已选中的洞位始终可点（取消路径），取消后未选项立即恢复可用。
- 落点态（`mode='land'`）行为不变。

### R3 状态存储：上限语义

- `toggleLitHole(hole, max)`：已选中的移除；未达上限追加；达上限忽略（UI 已禁用，不会静默失败）；`max <= 0` 忽略。
- 亮灯集合或倍率变化时清空 `recommendation`，避免 step1 展示与当前选择不符的概率。

### R4 页面：未选满可前进

- 提示：「最多选 N 个亮灯通道（已选 x/N），选 1 个即可继续」，选满时追加「已选满，取消已选可更换」。
- 「确定」按钮 `disabled={!multiplier || litHoles.length === 0}`。
- 推荐预取时机：选满时在 step0 预取；未选满时进入 step1 再按需拉取（`step > 1` 不拉）。

### R5 接口校验

- `POST /api/rounds`：`RoundInputSchema` 复用 `litHolesError`（1..N）。
- `PATCH /api/rounds/[id]`：合并最终值后、任何写操作之前校验同一规则，失败 400 `INVALID_INPUT`。
- `POST /api/recommend`：放宽为 `litHoles.length <= litCountFor(multiplier)`（schema 已保证 ≥1），否则 400。

### R6 测试

- store 上限语义单测（未满追加 / 达上限忽略 / 取消后补选 / 去重 / `max=0` / 各倍率不超上限 / 换倍率清空 / 亮灯变化作废推荐）。
- PATCH 校验用例（超上限 400、0 个 400、只改倍率致超上限 400、改宽倍率 200、重复 400、未选满 200 并重算）。
- schema 用例改为区间断言；E2E 覆盖「未选满可前进 / 选满后未选项禁用 / 取消后恢复」。

## Out of Scope

- 不改 `LIT_COUNT` 映射与任何算法（posterior / bandit / montecarlo）。
- 不改落点、发力、加注、推荐卡布局、提交 payload、离线队列。
- 不引入「必须量」模式或可配置的数量语义。

## Acceptance Criteria

- [ ] 2× 选 1~2 个时「确定」可点，可直接进入 step1 并看到推荐卡。
- [ ] 2×/4×/6×/8×/10× 的上限分别为 5/4/3/2/1；选满后其余洞位 `disabled` 且视觉降级，已选项仍可点取消。
- [ ] 0 个亮灯时「确定」禁用（每个倍率至少 1 个）。
- [ ] `PATCH /api/rounds/[id]` 提交超过上限或 0 个亮灯返回 400 `INVALID_INPUT` 且局数据与 session 统计不变；未选满（≥1）返回 200。
- [ ] `POST /api/recommend` 接受未选满的亮灯集合（1..N）。
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm playwright test tests/e2e/entry-flow.spec.ts` 全绿。

## Open Questions

（无。用户已明确「每个倍率最多 N 个、至少 1 个、未选满也能确定」。）
