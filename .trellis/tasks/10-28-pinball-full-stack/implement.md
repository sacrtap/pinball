# Implement — M1–M5 执行清单

> 顺序执行；每个 M 完成后跑该 M 验收命令，全绿才进入下一个 M。每 M 结束 commit 一次。

## M1 基座（认证+租户+数据层）

- [ ] M1.1 `create-next-app` 脚手架（src-dir=false, alias @/*, app router, tailwind, eslint）；装依赖；`docker-compose.yml`（postgres/pgbouncer/redis/app）+ `Dockerfile` + `.env.example` + `.gitignore`。
- [ ] M1.2 `prisma/schema.prisma` 全模型（Tenant/User/Membership/Machine/Session/Round/Posterior/SimParams/BanditArm/GlobalPrior/McSimCache/AuditLog + OtpCode）；迁移 `init` 末尾追加 RLS SQL；`prisma/sql/01-app-role.sql`；seed 脚本。
- [ ] M1.3 `lib/db/prisma.ts`（单例）、`lib/db/tenant.ts`（withTenant）、`lib/db/repo.ts`、`lib/types.ts`。
- [ ] M1.4 `lib/auth/config.ts`（Credentials+Google+GitHub、jwt 回调注 userId/tenantId、signIn 建默认租户）、`password.ts`（Argon2id）、`otp.ts`、`email.ts`（Resend→SMTP→console）、`app/api/auth/[...nextauth]/route.ts`、`middleware.ts`、login/register 页、register/verify-otp 路由（同事务建 User+Tenant+Membership）。
- [ ] M1.5 `lib/auth/tenant-resolve.ts`、`lib/auth/session.ts`；`app/(app)/page.tsx` 机台列表；machines/sessions CRUD 路由 + UI。
- [ ] M1.6 `tests/rls.test.ts`、`tests/auth.test.ts`。
- [ ] 验收：建库 → migrate deploy → seed → vitest 两测试 → dev 冒烟。

## M2 录入流

- [ ] M2.1 `lib/rules.ts` + `lib/schemas.ts`。
- [ ] M2.2 `app/api/rounds/route.ts`（幂等事务）、`rounds/[id]/route.ts`（PATCH/DELETE 回滚）；`lib/predict/posterior.ts`/`bandit.ts` counts±1 落库版。
- [ ] M2.3 EntryWizard 6 步 + 子组件 + TouchButton + play 页 + 预留 RecommendSheet/MonteCarloPanel 挂载点。
- [ ] M2.4 `lib/offline/outbox.ts` + `sync.ts`。
- [ ] M2.5 `tests/rounds.test.ts` + `tests/e2e/entry-flow.spec.ts`；验收。

## M3 算法栈 L1+L3+L4

- [ ] M3.1 posterior estimate/dirichletMean 补齐。
- [ ] M3.2 bandit recommend（K=2000、可复现 seed、degraded<0.55、双轨、channelProb）。
- [ ] M3.3 pooling：aggregateGlobalPrior + priorForMachine + initPosteriorWithPrior + contributeAnonymous 迁移 + admin 聚合 API。
- [ ] M3.4 `app/api/recommend/route.ts`（<20 降级）+ RecommendSheet + 录入流接入。
- [ ] M3.5 `tests/predict.test.ts`（收敛/不锁死/先验/降级）；验收。

## M4 蒙特卡洛 + 统计页 + worker

- [ ] M4.1 `lib/predict/montecarlo.ts`（simulate/fit 可复现）+ `lib/queue/redis.ts` + `lib/queue/montecarlo-worker.ts` + 阈值入队 + `app/api/montecarlo/route.ts` + MonteCarloPanel。
- [ ] M4.2 `lib/predict/evaluate.ts`。
- [ ] M4.3 stats 页全套图表 + VirtualList + session summary 页。
- [ ] M4.4 predict 测试扩展（同 seed 严格相等、fit 恢复 pegBias 误差<0.05、KL<0.05）+ 性能验收；验收。

## M5 打磨发布

- [ ] M5.1 tenants/invite/members/switch-tenant 路由 + TenantManager UI。
- [ ] M5.2 export（JSON/CSV+审计）+ account delete（物理删）+ UI。
- [ ] M5.3 `lib/audit.ts` 埋点 + DisclaimerBanner + rationalReminder 迁移 + Dockerfile 多阶段 + compose worker service + README + 生产 checklist（rate-limit 等）。
- [ ] M5.4 rls 测试扩展（未认证 401/跨团队隔离/注销空表）；全量收尾 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`；最终报告。

## 验证命令（每 M 结尾）

```
pnpm lint && pnpm typecheck && pnpm test
# M1: pnpm prisma migrate deploy && pnpm prisma db seed && pnpm vitest run tests/rls.test.ts tests/auth.test.ts
# M2: pnpm vitest run tests/rounds.test.ts && pnpm playwright test
# M3/M4: pnpm vitest run tests/predict.test.ts
# M5: pnpm vitest run tests/rls.test.ts
# 收尾: pnpm build
```

## 回滚点

每 M 一个本地 commit；某 M 三次修复不过 → `git reset` 回该 M 前 commit，上报失败详情。
