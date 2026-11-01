# 设计：亮灯数量改为上限区间

## 边界

| 层 | 文件 | 变更 |
|---|---|---|
| 规则 | `pinball/lib/rules.ts` | `litHolesError` 由定值改为区间 `[1, LIT_COUNT]` |
| 校验 | `pinball/lib/schemas.ts` | 复用 `litHolesError`（无改动，随规则生效） |
| 状态 | `pinball/lib/stores/entry-store.ts` | `toggleLitHole(hole, max)` 上限语义；亮灯/倍率变化作废推荐 |
| 控件 | `pinball/components/entry/HoleBoard.tsx` | 恢复 `maxSelect` 与达上限禁用 |
| 页面 | `pinball/components/entry/EntryWizard.tsx` | 文案、确定按钮条件、推荐预取时机 |
| 推荐接口 | `pinball/app/api/recommend/route.ts` | 校验放宽为 `length <= litCountFor(multiplier)` |
| 编辑接口 | `pinball/app/api/rounds/[id]/route.ts` | 已接入 `litHolesError`（写操作前），语义随规则生效 |
| 测试 | `tests/entry-store.test.ts`、`tests/rounds-patch-lit.test.ts`、`tests/rounds.test.ts`、`tests/e2e/entry-flow.spec.ts` | 区间语义断言 |

## 契约

### `litHolesError`

```ts
/** 合法返回 null；数量区间 [1, LIT_COUNT[multiplier]]，未选满合法 */
export function litHolesError(multiplier: Multiplier, litHoles: number[]): string | null;
```

判定顺序：`length < 1` → `length > max` → 重复 → 范围 1..12。上限取 `litCountFor`，不复制字面量。

### store

```ts
toggleLitHole: (hole, max) => void
```

- `max <= 0` → 忽略（倍率未选）。
- 已选中 → 移除，并 `recommendation: null`。
- `length < max` → 追加，并 `recommendation: null`。
- `length >= max` → 忽略（组件已禁用未选项，不存在静默失败路径）。

`setMultiplier` 同时清空 `litHoles` 与 `recommendation`。

推荐作废的理由：`RecommendCard` 用当前 `litHoles` 展示联合命中概率与热力图高亮，亮灯变化后旧推荐会让「亮灯通道之和 = 命中率」这句口径说明与实际不符。

### 推荐预取时机

```ts
if (!multiplier || litHoles.length === 0 || step > 1) return;
if (step === 0 && litHoles.length !== litMax) return; // 未满时进 step1 再拉
if (store.recommendation) return;
```

- 选满：step0 即预取，进 step1 无等待。
- 未满：点「确定」进入 step1 后触发，`step1` 期间显示「推荐加载中…」直到返回。
- `step > 1` 不拉，避免落点页发出无意义请求。

### 确定按钮

`disabled={!multiplier || litHoles.length === 0}`——只要求「已选倍率 + 至少 1 个通道」。

### PATCH 校验位置（沿用上一轮）

`withTenant` 回调内 `getRound` 之后、回滚 L1/L3/session 统计之前调用 `litHolesError`；失败 `return { ok: false, issues }`，事务空提交、无副作用，路由层渲染 400 `INVALID_INPUT`，不引入 try/catch。

## 权衡

| 方案 | 取舍 |
|---|---|
| 选满后禁用未选项 | 上限可见、无静默失败；代价是换灯需先取消一步 → 采纳（上限语义下的正确表现） |
| 选满后点新项替换（FIFO） | 只有「必须量」语义才成立；本任务明确是上限，否决 |
| 允许 0 个亮灯提交 | 会造成 hit 恒 false、推荐无目标；用户明确「至少 1 个」→ 下限 1 |

## 兼容与回滚

- 无 DB schema 变更。历史数据中长度 ≤ 上限的局全部合法；若有历史超限数据（修复前的编辑漏洞），不主动清理。
- 回滚点：6 个源文件独立，任一 revert 不会破坏其余层（`litHolesError` 为新函数，`SELECTABLE_DISABLED` 为恢复的既有常量）。

## 风险

- 推荐接口放宽后，旧客户端（始终传满 N 个）行为不变。
- 未选满进入 step1 时推荐请求多一次网络往返，属可接受延迟。
