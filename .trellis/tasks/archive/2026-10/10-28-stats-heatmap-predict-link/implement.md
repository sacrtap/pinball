# 执行计划 — 统计页落点热力图与预测链路修复

前置：任务已分类为复杂任务，三件套（prd/design）已就绪。`task.py start` 后按序执行。

## 步骤

- [ ] S1 迁移 + schema：`Round` 加 `predictedHitProb DOUBLE PRECISION` 列；`RoundFieldsSchema` 加 `predictedHitProb: z.number().min(0).max(1).optional().nullable()`；测试库与开发库均 `prisma migrate deploy` + `prisma generate`
- [ ] S2 `evaluate.ts` 新增 `landHoleByPower(rounds, holeCount)` 纯函数（固定 POWER_LEVELS 顺序，缺失补 0，带每档 total）
- [ ] S3 `repo.createRound` + `rounds/route.ts` 透传 `predictedHitProb`
- [ ] S4 `EntryWizard.submit()` payload 补 `recommendedPower` / `recommendMode` / `predictedHitProb`（取自 `store.recommendation`；无推荐则 null）
- [ ] S5 `StatsCharts.tsx`：落点区块改为发力×洞位矩阵热力图（CSS Grid + color-mix + overflow-x-auto + 合规提示）；三个区块补指标说明文案
- [ ] S6 `stats/page.tsx`：select/map 补 `predictedHitProb`，data 加 `landHoleByPower`
- [ ] S7 单测：`tests/evaluate-*.test.ts`（或既有 stats 相关套件）新增 `landHoleByPower` 用例（含空档补 0、行内 total、洞位越界安全）
- [ ] S8 单测：rounds POST 透传用例——带 recommendedPower/recommendMode/predictedHitProb 提交后 DB 三字段非空（沿用 `withTenant` + `tests/helpers/db.ts`）
- [ ] S9 验证三门：`pnpm lint && pnpm typecheck && pnpm test`（含既有 35 用例不回归）
- [ ] S10 E2E 冒烟：Playwright entry-flow 全量跑（录入流 payload 变更须确认无回归）；stats 页热力图渲染冒烟（有数据时矩阵非空）
- [ ] S11 视觉核验：浏览器实测 stats 页热力图（数据构造：≥3 局不同发力）——截图确认着色/滚动/合规提示

## 验证命令

```bash
cd pinball
pnpm lint && pnpm typecheck && pnpm test
pnpm playwright test            # 全量（禁只跑改动 spec，见 spec 约定）
```

## 回滚点

- 每步独立可回滚：S1 迁移为加列（回滚 = 新迁移删列，或开发库本地 reset）；S4-S6 是展示/透传层，git revert 单文件即可。
- S4 是数据链路变更：若 E2E 发现录入回归，优先回滚 S4（payload 加字段对后端是 optional，不影响旧数据）。

## 风险

| 风险 | 缓解 |
| --- | S4 payload 增加 optional 字段，schema 均 optional → 旧客户端不传也不破 | 已通过 schema optional 化解 |
| 热力图 12 列在 390px 溢出 | `overflow-x-auto` + `min-w-7`；E2E 移动视口实测 |
| 测试库迁移漂移 | S1 同步 migrate deploy 两库；跑 test 确认连接无 uuid 解析错 |

## Review Gate

S9-S11 全绿后进入 trellis-check（派发子 agent）；检查重点：算法语义未改、合规提示在位、E2E 全量跑过。
