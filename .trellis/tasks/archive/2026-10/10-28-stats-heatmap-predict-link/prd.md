# 统计页落点热力图与预测链路修复 — PRD

## 背景与问题

复盘统计页（`app/(app)/stats/`）当前存在 1 个可视化缺口、2 个指标说明缺失、2 个数据链路断裂：

1. **落点分布图信息维度单一**：`landDist` 把全部局按 `landHole` 拉平成 12 桶直方图，完全丢弃 `power` 维度。用户无法回答「大/中/小力分别倾向落哪个洞」。
2. **「模型校准」「累计后悔」无任何指标说明**：两个标题是算法术语，用户不理解含义与读法。
3. **「推荐回测」永远显示 0（真 Bug）**：`backtest()` 依赖 `Round.recommendedPower`，但录入链路（`EntryWizard.submit()` 构造的 payload）从不提交该字段——API schema 接受、DB 列存在、算法已实现，唯独写入入口没填。功能自上线起未接通。
4. **「模型校准」曲线失真（连带 Bug，本轮一并修）**：`calibration()` 的预测概率取 `r.predictedHitProb`，但 `Round` 表**没有该列**、录入也不提交。代码走 `?? globalRate` 兜底，所有局用同一常数预测，校准曲线退化为竖直对角线，失去意义。

## 目标

- G1：落点分布改为「发力 × 洞位」矩阵热力图，直观呈现不同力道的落点聚集。
- G2：模型校准、累计后悔、推荐回测三个区块补充中文指标说明（含义 + 读法 + 当前数据可信度）。
- G3：修复 `recommendedPower` 写入链路，使推荐回测产出真实数据。
- G4：修复 `predictedHitProb` 写入链路，使模型校准恢复真实预测口径。

## 需求明细

### R1 落点×发力矩阵热力图

- 服务端聚合新增 `landHoleByPower`：3 档（low/mid/high）× 12 洞的计数矩阵。
- 前端以矩阵热力图替换现有直方图区块（保留 χ² 检验数值展示）。
- 视觉规范遵循既有「发力×倍率命中率」表格的 `color-mix` 着色思路；移动端 12 列需可横向滚动或压缩间距。
- 合规红线：该图仅呈现历史统计，区块需带「历史统计不构成未来保证」提示（与 `DisclaimerBanner` 口径一致）。

### R2 指标说明

三个区块各补充一段说明文案（`<p>` 小字，位于标题下方或图下方）：

| 区块 | 需说明 |
| --- | --- |
| 模型校准 | 把预测命中概率分 10 桶对比实际命中率；点贴对角线=预测准，上方=低估、下方=高估 |
| 累计后悔 | 每局「当时已知最优档位返还率 − 本局实际返还率」的累计和；曲线陡=早期选错档的代价 |
| 推荐回测 | 对比「每局都按系统推荐发力」的期望盈亏 vs 实际盈亏；差值反映推荐质量 |

说明须如实反映**当前数据可信度**：`recommendedPower` 修复后仅对新录入局有效，历史局该字段为 null，回测样本 n 会远小于总局数——文案需点明「仅统计修复后录入的局」。

### R3 回测链路修复

- `EntryWizard.submit()` payload 增加 `recommendedPower` 与 `recommendMode`，取 `store.recommendation`（亮灯选满时已预取的 `/api/recommend` 结果）。
- 推荐为降级模式（`degraded: true`，样本 <10 局）时也应记录 `recommendMode: 'prior'`——回测如实反映推荐质量，包括降级期。
- 离线 outbox 重放路径复用同一 payload，无需额外改动。

### R4 校准链路修复

- 新增 Prisma 迁移：`Round` 表加 `predictedHitProb Float?` 列。
- 录入时把该局的预测命中概率落库。**数据来源决策**：`/api/recommend` 返回的 `litHitProb` 即「推荐臂亮灯联合命中概率」，是录入时点的真实预测值，直接采用；服务端不重算（避免第二套实现漂移）。
- `calibration()` 增加 `predictedHitProb` 输入（已有字段，改查询即可），缺失时保持 `?? globalRate` 兜底。
- 注意：`recommendMode` 已有列但前端也未提交——与 R3 一并补上（回测说明与后续审计都需要）。

## 约束

- 遵守合规红线：所有统计/概率区块不得移除「概率仅为统计估计」「历史统计不构成未来保证」提示；不新增资金/兑现语义。
- 遵守 UI 基元契约：新组件优先用 `components/ui/` 基元与 `styles.ts` 常量；不引外部图表库（沿用 Recharts + Tailwind）。
- 热力图可用 CSS Grid + `color-mix` 实现，不引 heatmap 库（项目无该依赖，避免为单图加依赖）。
- 数值口径不得改动：`calibration`/`backtest`/`regretCurve` 的算法逻辑本轮只做「补输入」，不改计算语义（语义变更需单独评估）。

## 验收标准

- [ ] A1：统计页落点区块为 3×12 矩阵热力图，单元格显示计数/占比，着色随密度变化；χ² 数值仍在。
- [ ] A2：模型校准、累计后悔、推荐回测三个区块均有中文指标说明；回测说明点明「仅统计录入时记录了推荐的局」。
- [ ] A3：新录入一局（已预取推荐）后，DB 中该 round 的 `recommendedPower`、`recommendMode`、`predictedHitProb` 非空。
- [ ] A4：录入 ≥2 局后，统计页「推荐回测」的 n > 0 且三卡数值非全 0。
- [ ] A5：Vitest 新增 `landHoleByPower` 聚合与「recommendedPower 透传」用例；既有 35 用例全绿。
- [ ] A6：`pnpm lint` / `pnpm typecheck` 通过；Playwright entry-flow 不回归。
- [ ] A7：迁移可重复执行（`prisma migrate deploy` 幂等），测试库与开发库均需迁移。
