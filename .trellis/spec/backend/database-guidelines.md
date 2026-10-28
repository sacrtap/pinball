# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

<!--
Document your project's database conventions here.

Questions to answer:
- What ORM/query library do you use?
- How are migrations managed?
- What are the naming conventions for tables/columns?
- How do you handle transactions?
-->

(To be filled by the team)

---

## Query Patterns

<!-- How should queries be written? Batch operations? -->

(To be filled by the team)

---

## Migrations

<!-- How to create and run migrations -->

(To be filled by the team)

---

## Naming Conventions

<!-- Table names, column names, index names -->

(To be filled by the team)

---

## Common Mistakes

<!-- Database-related mistakes your team has made -->

### 新增持久化字段必须打通「六环链路」

新增字段喂给统计/算法函数时，六环须同步到位：

1. Prisma schema + 迁移（纯加列，可重复 deploy）
2. Zod 输入 schema（`RoundFieldsSchema` 等）
3. repo create 的 data
4. API route 透传（`input.X ?? null`）
5. **录入入口 payload（`EntryWizard.submit()`）** ← 最易漏
6. stats page 的 select + projection

**失败模式（2026-10-28 实测）**：字段可在 1-4 与算法层全部就绪，仍因第 5 环漏填而**静默失效**——`Round.recommendedPower` 自项目建立起就没被录入入口提交过，`backtest()` 的 `if (!rec) continue` 让所有局被跳过，统计页「推荐回测」恒显示 n=0 / 三卡全 0，无人发现。同类：`predictedHitProb` 列曾不存在，`calibration()` 走 `?? globalRate` 常数兜底，校准曲线退化为竖直线。

**为何静默**：兜底分支（`?? globalRate`、`if (!rec) continue`）不报错、不告警，页面照常渲染。唯一可观测信号是统计函数的 `n` 与空桶。

**契约**：

- 新增 Round 字段后，**必须**有一条单测从「构造 payload → POST → 读回 DB」全链路断言字段非空（参考 `tests/rounds-predict-fields.test.ts` 的六路径用例：带值 / 降级模式 / 不带 / 显式 null / 越界拒绝 / 幂等保留快照）。
- 统计纯函数的兜底退化须在 UI 文案如实声明样本来源（如「样本 n = X（仅统计录入时记录了推荐的局）」），不可让兜底数据冒充完整统计。
- 编辑路径（PATCH）默认隐式保留快照（Prisma `update` 不动未列出的列）——对「录入时点预测值」这类字段是正确语义，编辑不得覆写。

