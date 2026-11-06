# 发力推荐卡追加建议总珠数

## Goal

在发力与加注页推荐卡标题行「发力推荐」后追加「建议 N 珠」：按 θ̂×倍率 与 1 比较，正期望建议顶格 60、非正保底 5。纯函数入 lib/rules.ts，UI 在 RecommendCard 标题行，补边界测试与 E2E。

## Requirements

- 在发力与加注页（step1）推荐卡标题行「发力推荐」后追加「建议 N 珠」
- 建议值 = `suggestTotalBet(θ̂, multiplier)`：θ̂×倍率 > 1 → 60（顶格）；≤ 1 → 5（保底）
- 纯函数入 `lib/rules.ts`（业务规则单一来源）；θ̂ 取 `RecommendCard` 已有的 `litHitProb`
- 不展示期望净收益等连续统计量（component-guidelines：统计量与离散值标签不可混）

## Acceptance Criteria

- [x] 标题行渲染「发力推荐 · 建议 N 珠」，N ∈ {5, 60}
- [x] θ̂×倍率 边界（>1 / =1 / <1）单测覆盖（tests/suggest-total-bet.test.ts，4 例）
- [x] 全量 E2E 通过；E2E 实证：10 局全命中 10× 机台 → 建议 60 珠
- [x] lint / typecheck / test 全绿（66 passed）

## Notes

- 单局期望净收益 = 总珠数 × (θ̂ × 倍率 − 1)，对投入线性，无凹性 → 两档即数学最优
- 合规：建议为统计口径，DisclaimerBanner 常驻提示不变
