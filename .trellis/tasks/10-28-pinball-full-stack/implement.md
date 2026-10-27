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

- [x] M3.1 posterior estimate/dirichletMean 补齐。
- [x] M3.2 bandit recommend（K=2000、可复现 seed、degraded<0.55、双轨、channelProb）。
- [x] M3.3 pooling：aggregateGlobalPrior + priorForMachine + initPosteriorWithPrior + contributeAnonymous 迁移 + admin 聚合 API。
- [x] M3.4 `app/api/recommend/route.ts`（<20 降级）+ RecommendSheet + 录入流接入。
- [x] M3.5 `tests/predict.test.ts`（收敛/不锁死/先验/降级）；验收。

## M4 蒙特卡洛 + 统计页 + worker

- [x] M4.1 `lib/predict/montecarlo.ts`（simulate/fit 可复现）+ `lib/queue/redis.ts` + `lib/queue/montecarlo-worker.ts` + 阈值入队 + `app/api/montecarlo/route.ts` + MonteCarloPanel。
- [x] M4.2 `lib/predict/evaluate.ts`。
- [x] M4.3 stats 页全套图表 + VirtualList + session summary 页。
- [x] M4.4 predict 测试扩展（同 seed 严格相等、fit 恢复 pegBias 误差<0.05、KL<0.05）+ 性能验收；验收。

## M5 打磨发布

- [x] M5.1 tenants/invite/members/switch-tenant 路由 + TenantManager UI。
- [x] M5.2 export（JSON/CSV+审计）+ account delete（物理删）+ UI。
- [x] M5.3 `lib/audit.ts` 埋点 + DisclaimerBanner + rationalReminder 迁移 + Dockerfile 多阶段 + compose worker service + README + 生产 checklist（rate-limit 等）。
- [x] M5.4 rls 测试扩展（未认证 401/跨团队隔离/注销空表）；全量收尾 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`；最终报告。

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


## 完成记录（2026-10-28）

全部 M1-M5 完成，二元成功标准达成：
- `pnpm lint` exit 0、`pnpm typecheck` exit 0
- `pnpm vitest run`：4 文件 28 passed / 1 skipped（rls 8 项含跨团队隔离+注销物理删、auth 4、rounds 6、predict 11）
- `pnpm build` exit 0；`next start` 冒烟：注册→登录→建机台→建 Session→录 21 局→推荐(mode=thompson)→统计页 200
- `pnpm playwright test`：2 项 E2E 全绿（3 局统计 + 断网恢复同步不重复）
- commit：489414d(M1) / 3614310(M2) / 655420e(M3) / 0522b15(M4) / ec6b9c1(M5)

环境降级项：
- 本地 PG 用 Postgres.app 二进制 initdb 的独立实例（端口 5433）：Postgres.app 托管实例的
  `auth_permission_dialog` 共享库会阻塞后台服务进程的 TCP 连接（前台终端不受影响）。
- 聚合角色 pinball_agg（BYPASSRLS）专供 L4 跨租户聚合。
- Docker 未本地验证（本机 Docker 不可用）；OAuth 凭据留空（provider 代码就位，降级邮箱+OTP）。
