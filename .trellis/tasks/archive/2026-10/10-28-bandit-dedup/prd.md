# Thompson 采样去重：去 banditAlpha/beta 叠加

## Goal

修复 `lib/predict/bandit.ts` Thompson 采样中的证据重复计数：`litMass`（Dirichlet 落点分布派生）与 `banditAlpha`（Bernoulli 命中计数）描述同一命中事件，叠加使等效样本数虚增约 89%、Beta 标准差收窄 27%，导致三档真实命中率接近时被误判为「显著最优」（`degraded=false`），丧失探索价值。

## Background（验证证据）

探测脚本（场景 A：三档 0.48/0.50/0.52；场景 B：0.50/0.50/0.30）：

| 指标 | 不叠加(pure) | 叠加(stacked) |
|---|---|---|
| 等效样本数 N | 112 | 212 |
| Beta 标准差 | 0.047 | 0.034（收窄 27%） |
| 重复量 deltaN | — | = banditAB（100） |

- 场景 A：三档 θ 几乎相同（0.536/0.500/0.500），叠加后 `bestArmProb=0.649`，low 被选概率 3.7×，`degraded=false`
- 场景 B：low/mid 真实命中率相同(0.50)，叠加后 `0.912 vs 0.088`，`degraded=false`

## Requirements

### R1 采样去重
- `bandit.ts:149-152` 采样改为纯 `Beta(litMass, nonLitMass)`，删除 `+ banditAlpha` / `+ banditBeta`
- `arms` 构造里 `banditAlpha`/`banditBeta` 字段保留读取（calibration 独立信号），但不再参与采样
- 更新注释，说明 BanditArm 仅作校准信号、不参与选档采样

### R2 回归测试
- 构造场景 A（三档接近），断言 `degraded === true` 或 `max(bestArmProb) < DEGRADED_THRESHOLD`
- 现有测试 ③「双档接近不锁死」需复核：去重后 bestArmProb 上界断言（`< 0.95`）应仍成立

### R3 不动项
- `updateBanditArm`/`revertBanditArm` 保留（BanditArm 表继续落库，供 calibration/backtest）
- `RecommendResult` 接口不变
- `litHitProb`/`channelProb`/`expectedReturn` 计算不变
- 后端 route.ts 不动

## Acceptance Criteria

- [ ] `bandit.ts` 采样用纯 `Beta(litMass, nonLitMass)`，无 banditAlpha/beta 叠加
- [ ] 三档接近场景（0.48/0.50/0.52）`degraded === true`
- [ ] 测试 ②偏态收敛（high 0.6 vs 0.3）仍 thompsonPower=high、bestArmProb>0.8
- [ ] 测试 ③双档接近不锁死仍 bestArmProb 两档>0、max<0.95
- [ ] `typecheck`、`lint`、`vitest`、全量 E2E 全绿
