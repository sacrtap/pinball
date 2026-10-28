# PRD — 幻想兔弹珠机预测系统 M1–M5 全栈开发

## 需求来源

- 执行计划：`幻想兔弹珠机预测系统_PLAN.md`（M1–M5 逐步骤）
- 产品需求：`docs/PRD-弹珠机预测系统.md`
- 技术方案：`docs/TECH-PLAN-弹珠机预测系统.md`

三者冲突时以后两份文档为准，取舍记录于本 task 的 `design.md`「偏差记录」。

## 目标

从空仓库按 PLAN M1→M5 顺序零决策落地 PRD v2.0 全量需求：多租户 SaaS 化弹珠机个人统计分析工具（注册登录 → 机台建档 → 向导录入对局 → 满 20 局四层算法栈推荐 → 复盘统计 → 团队协作 → 导出/注销/审计/部署）。

## 功能范围（PRD §2）

- 认证：OAuth(Google+GitHub) + 邮箱密码 + 邮箱 OTP；注册与建租户单事务。
- 租户隔离：应用层 `withTenant` + PG RLS 双层；个人/团队租户；租户切换。
- 机台/Session CRUD：建档、编辑、删除（级联）、关闭。
- 录入：EntryWizard 6 步（倍率/亮灯/加注/发力/落点/判中提交），单局 ≤6 点按，事务内含幂等（`clientRequestId`）+ session 冗余统计 + L1/L3 计数更新；编辑/撤销同事务回滚。
- 离线：localStorage outbox 队列，断网暂存、恢复自动同步、不重复不丢失。
- 算法栈：L1 Dirichlet 后验、L2 蒙特卡洛高尔顿板（BullMQ 异步 + fitVersion 缓存）、L3 Thompson 采样上下文老虎机（双轨 thompson/argmax、degraded<0.55）、L4 层次贝叶斯部分池化（匿名全局先验）。
- 推荐：样本 ≥20 解锁双轨 UI；不足降级先验并标注。
- 统计：命中率矩阵、落点分布+理论叠加、盈亏趋势、校准、回测、regret、χ²、对数似然；1000 局渲染 <500ms。
- 打磨：团队邀请、导出 JSON/CSV、注销物理删数据、审计日志、免责声明常驻、理性提醒开关、Docker 一键部署、生产安全 checklist。

## 全局约束

- 包管理器 pnpm；技术栈锁定 Next.js 15 App Router + TS + PG + Prisma + Auth.js v5 + Tailwind + Zustand + zod + Recharts + Vitest + Playwright + Docker。
- 规则常量单一来源 `lib/rules.ts`（HOLE_COUNT=12、MULTIPLIERS、LIT_COUNT、BASE_BET=5、SAMPLE_THRESHOLD=20、CARD_THRESHOLD=30、CARD_MAX=5）；类型 `lib/types.ts`；zod `lib/schemas.ts` 前后端共享。
- 数据层唯一入口 `lib/db/tenant.ts` `withTenant`；repo 函数第一参 `tx`；连接角色非 superuser 非 BYPASSRLS。
- 时间 `timestamptz` + ISO 8601 UTC；移动端优先（控件 ≥48px，360–430px）。
- 每里程碑结尾跑 `pnpm lint && pnpm typecheck && pnpm test`；里程碑进行中不跑 lint/format/全量 build。
- 禁改 `docs/`、`.trellis/`、`AGENTS.md`、PLAN 本身；可写 `pinball/` 源码与 README/CHANGELOG。

## 验收标准（二元）

1. M1–M5 全部源码落地，Critical files & anchors 所列文件无 stub/TODO。
2. `pnpm lint` / `pnpm typecheck` / `pnpm vitest run` / `pnpm build` 全部退出码 0（集成测试用本机 PG18）。
3. RLS 测试：双租户交叉访问恒 0 行、未认证 401、幂等不双写、注销后数据空。
4. `pnpm dev` 冒烟：注册→登录→建机台→建 Session→录 ≥20 局→推荐出现→统计页渲染。
5. 里程碑门控：每个 M 验收命令全绿才进下一个 M。
6. 降级项（OAuth 凭据缺失→邮箱 OTP 推进；EMAIL_MODE=console；Docker 不可用→交付物编写不本地验证；worker 未起→MonteCarloPanel 待计算）不阻塞对应里程碑，但须在最终报告列明。

## 非功能

- 录入 p95 <300ms；1000 局统计页 DOMContentLoaded <500ms。
- 算法与 RLS 代码 100% 测试覆盖。
- E2E：Playwright mobile 390×844。
