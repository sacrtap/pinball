# 预测解锁阈值 20→10 局

## 背景

当前发力推荐解锁门槛 `SAMPLE_THRESHOLD = 20`（`lib/rules.ts:25`）：样本 <20 局时 `/api/recommend` 降级为先验（degraded），EntryWizard 显示「再录 X 局解锁发力推荐」。用户希望提前到 10 局即可解锁 Thompson 推荐。

## 需求

将 `SAMPLE_THRESHOLD` 从 20 调整为 10。单一常量来源，所有消费方自动同步。

## 改动范围

| 文件 | 行 | 改动 |
| --- | --- | --- |
| `lib/rules.ts` | 25 | `20` → `10` |
| `tests/predict.test.ts` | 191 | 断言 `toBe(20)` → `toBe(10)` |
| `app/api/recommend/route.ts` | 36 | 注释 `<20 局` → `<10 局`（文档同步） |
| `components/entry/EntryWizard.tsx` | 238 | 注释 `满 20 局` → `满 10 局`（文档同步） |

## 验收

1. `typecheck` 0 error、`lint` 0 issue
2. `vitest` 28 passed/1 skipped（predict.test 阈值断言更新后仍绿）
3. `/api/recommend` 在样本 <10 局返回 `degraded:true` + `message` 含 `10`；≥10 局返回 Thompson
4. EntryWizard 在 roundCount<10 且 step1 显示「再录 {10-roundCount} 局解锁发力推荐」
