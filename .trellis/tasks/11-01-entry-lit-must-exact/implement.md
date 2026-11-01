# 执行计划：亮灯数量改为上限区间

## 已完成顺序

1. `pinball/lib/rules.ts`：`litHolesError` 改为区间 `[1, litCountFor(multiplier)]`。
2. `pinball/lib/stores/entry-store.ts`：`toggleLitHole(hole, max)` 上限语义；`setMultiplier` 与亮灯变化清空 `recommendation`。
3. `pinball/components/entry/HoleBoard.tsx`：恢复 `maxSelect`、`SELECTABLE_DISABLED`、达上限禁用未选项、`aria-label` 追注。
4. `pinball/components/ui/styles.ts`：恢复 `SELECTABLE_DISABLED`（本任务重新有消费方）。
5. `pinball/components/entry/EntryWizard.tsx`：`litMax` 文案、确定按钮 `length === 0` 禁用、预取时机按 step 分流。
6. `pinball/app/api/recommend/route.ts`：`length > litCountFor(multiplier)` 才 400。
7. `pinball/app/api/rounds/[id]/route.ts`：保留写操作前的 `litHolesError` 校验。
8. 测试：`tests/entry-store.test.ts`（8 例上限语义）、`tests/rounds-patch-lit.test.ts`（6 例区间校验）、`tests/rounds.test.ts`（schema 区间断言）、`tests/e2e/entry-flow.spec.ts`（未选满可前进 / 选满禁用 / 取消恢复）。
9. `.trellis/spec/frontend/component-guidelines.md`：数量型控件先判定 max / exact 语义，上限语义必须显式禁用。

## 验证命令（均在 `pinball/`）

```bash
pnpm lint && pnpm typecheck
pnpm test
TEST_BASE_URL=http://localhost:8477 pnpm playwright test tests/e2e/entry-flow.spec.ts
```

手工冒烟（dev :8477，390×844）：

1. 2× → 选 1 个 → 「确定」可点；选满 5 个 → 6~12 禁用；取消 1 个 → 恢复可选。
2. 未选满（4/5）进入 step1 → 推荐卡按所选通道给出命中率（亮灯 2、3、4、5 之和）。
3. 10× → 选 1 个后其余 11 个禁用。

## 高风险文件与回滚点

- `app/api/rounds/[id]/route.ts`：校验必须早于任何写操作，回滚时该文件可独立 revert。
- `lib/stores/entry-store.ts`：`reset()` 软重置语义不变（不清 multiplier）。
- `components/ui/styles.ts`：`SELECTABLE_DISABLED` 的消费方只有 `HoleBoard`，删除前需 grep。

## 结束前检查

- [x] `grep litCount`（旧必须量变量）无残留
- [x] `grep FIFO` 在业务代码无残留
- [x] 新增测试不依赖 fixture 顺序（vitest 已串行）
