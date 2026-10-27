# 「幻想兔」弹珠机预测系统 — 执行计划

> 目标：从空仓库（仅有 `docs/` 与 Trellis 基础设施，无任何源码）按 5 个里程碑零决策落地 PRD v2.0 / TECH-PLAN v2.0 全量需求。
> 技术栈已锁定：Next.js 15 (App Router) + TypeScript + PostgreSQL 16 + Prisma + Auth.js v5 + Tailwind + Zustand + zod + Recharts + Vitest + Playwright + Docker(全栈)。
> 用户决策：①部署形态=自建 Docker 全栈（docker-compose: app+postgres+pgbouncer+redis，蒙特卡洛用 BullMQ worker 异步执行并按 fitVersion 缓存）；②认证范围=M1 即含 OAuth（Google+GitHub）+ 邮箱 OTP。

---

## Context

PRD 定义一款多租户 SaaS 化弹珠机个人统计分析工具：用户注册登录 → 机台建档 → 向导式快速录入对局（倍率/亮灯/加注/发力/落点）→ 满 20 局后基于四层算法栈（L1 Dirichlet 后验 / L2 蒙特卡洛高尔顿板 / L3 Thompson 采样上下文老虎机 / L4 层次贝叶斯部分池化）给出发力档位推荐与通道概率 → 复盘统计（命中率矩阵、校准、回测、regret、χ²）。核心机制：12 物理洞口，倍率池 [2,4,6,8,10]，亮灯通道数 2×:5 / 4×:4 / 6×:3 / 8×:2 / 10×:1，奖励=投入×倍率，单次奖励≥30 珠出积分卡（每 30 珠 1 张，上限 5 张）。租户隔离=应用层 `withTenant` + 数据库 RLS 双层强制；录入幂等=`clientRequestId`；离线容错=本地 outbox 队列重放。本计划按 M1→M5 顺序构建，每步产出的代码须通过对应里程碑验收检查，全部完成后满足 PRD §2 全部功能需求与非功能需求。

## 全局约定（贯穿所有里程碑）

- 包管理器：**pnpm**。所有 setup 用 `pnpm dlx create-next-app` + `pnpm add`。
- 洞口数常量 `HOLE_COUNT=12`；倍率 `MULTIPLIERS=[2,4,6,8,10]`；亮灯数映射 `LIT_COUNT={2:5,4:4,6:3,8:2,10:1}`；默认投入 `BASE_BET=5`；样本门槛 `SAMPLE_THRESHOLD=20`；卡片阈值 `CARD_THRESHOLD=30`；卡片上限 `CARD_MAX=5`。全部集中 `lib/rules.ts` 单一来源，前后端共享；严禁在组件/路由内重复字面量。
- 类型 `Multiplier=2|4|6|8|10`、`PowerLevel='low'|'mid'|'high'` 定义于 `lib/types.ts`，全栈引用。
- zod schema 与 `lib/rules.ts` 共同定义在 `lib/schemas.ts`，前后端复用；API 路由与 Server Action 一律 `safeParse` 入参。
- 数据层唯一入口 `lib/db/tenant.ts` 的 `withTenant(tenantId, fn)`；禁止任何仓储函数绕过它。连接角色为普通角色（非 superuser、非 BYPASSRLS）。
- 所有时间用 `timestamptz` 存储，API 序列化统一 ISO 8601 UTC 字符串。
- 移动端优先：录入控件按钮 ≥48px，布局适配 360–430px。
- 每个里程碑完成时：运行该里程碑的验收命令（见各里程碑 Verification）；算法与 RLS 相关代码须 100% 测试覆盖。
- 测试库：Vitest（单测/集成）+ Playwright（E2E mobile viewport 390×844）。
- 不在里程碑进行中跑 lint/format/全量 build；每个里程碑结尾统一跑 `pnpm lint && pnpm typecheck && ppm test`。

---

## M1 基座：Docker 环境 + 认证 + 租户 + 数据层

> 验收：RLS 集成测试全绿（双租户交叉访问恒 0 行）；注册→登录→建机台→建 Session 走通；OAuth(Google+GitHub)+邮箱OTP 均可登录。

### M1.1 工程脚手架与 Docker 环境
1. `pnpm dlx create-next-app@latest pinball --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*"`（在仓库根生成；保留现有 `docs/`、`.trellis/`、`AGENTS.md`）。安装依赖：`pnpm add @prisma/client prisma @auth/prisma-adapter @auth/core argon2 zod zustand recharts lucide-react @aws-sdk/client-ses`（邮件 OTP，见 M1.4 选型说明）；dev：`pnpm add -D vitest @playwright/test @types/node prettier eslint-config-next`。
2. 创建 `docker-compose.yml`：服务 `postgres`（image postgres:16-alpine，env POSTGRES_DB/USER/PASSWORD，volume `pgdata`，healthcheck `pg_isready`）、`pgbouncer`（image edoburu/pgbouncer:1.23，env 连接 postgres，pool_mode=transaction，max_client_conn=200，default_pool_size=20）、`redis`（image redis:7-alpine，healthcheck `redis-cli ping`）、`app`（build `./Dockerfile`，depends_on postgres+pgbouncer+redis healthy，env `DATABASE_URL` 指向 pgbouncer:6432、`DIRECT_DATABASE_URL` 指向 postgres:5432、`REDIS_URL`、`AUTH_SECRET`、`AUTH_GOOGLE_*`、`AUTH_GITHUB_*`、`EMAIL_*`、`NEXTAUTH_URL`）。PgBouncer 用 transaction 模式以兼容 RLS 的 `set_config(...,true)` 事务本地设置。
3. 创建 `Dockerfile`：`FROM node:20-alpine`，装 pnpm，`pnpm install --frozen-lockfile`，`pnpm build`，`CMD ["pnpm","start"]`，暴露 3000。
4. 创建 `.env.example`：列出 `DATABASE_URL`、`DIRECT_DATABASE_URL`、`REDIS_URL`、`AUTH_SECRET`、`AUTH_GOOGLE_ID/SECRET`、`AUTH_GITHUB_ID/SECRET`、`EMAIL_FROM`、`EMAIL_SERVER`（或 `RESEND_API_KEY`）、`NEXTAUTH_URL`。创建 `.gitignore` 追加 `.env*`、`node_modules`、`.next`、`pgdata`、`coverage`。

### M1.2 Prisma schema + 迁移 + RLS
5. 创建 `prisma/schema.prisma`：generator client（provider prisma-client-js，previewFeatures `["fullTextSearch"]` 不需要）；datasource postgresql（env DATABASE_URL）。模型按 PRD §4：`Tenant`(id @db.Uuid @default(uuid()), name String, createdAt DateTime @default(now()))、`User`(id @db.Uuid, email String @unique @db.Citext, passwordHash String?, createdAt)、`Membership`(tenantId, userId 复合主键, role String, @@index([userId]))、`Machine`(id, tenantId, code, name?, venue?, holeCount Int @default(12), holeNumbering String @default("ltr"), createdAt; @@unique([tenantId,code]); @@index([tenantId]))、`Session`(id, tenantId, machineId, startedAt, endedAt?, status String, roundCount Int @default(0), totalBet Int @default(0), totalWin Int @default(0), cards Int @default(0); @@index([tenantId, machineId]))、`Round`(id, tenantId, sessionId, seq Int, multiplier Int, litHoles Int[], baseBet Int, extraBet Int, totalBet Int, power String, landHole Int, hit Boolean, reward Int, cardIssued Int, recommendedPower String?, recommendMode String?, modelVersion Int @default(1), edited Boolean @default(false), clientRequestId String, createdAt; @@unique([tenantId, sessionId, clientRequestId]); @@index([tenantId, sessionId]); @@index([tenantId, machineId, createdAt]))、`Posterior`(tenantId, machineId, power, counts Int[]; @@unique([tenantId, machineId, power]))、`SimParams`(tenantId, machineId, power, pegBias Float, entryOffset Float, spread Float, fittedAt DateTime, sampleN Int; @@unique([tenantId, machineId, power]))、`BanditArm`(tenantId, machineId, power, alpha Float, beta Float; @@unique([tenantId, machineId, power]))、`GlobalPrior`(power String @pk, counts Int[], sampleN Int)、`McSimCache`(tenantId, machineId, power, fitVersion Int, dist Float[], stderr Float[], computedAt; @@unique([tenantId, machineId, power, fitVersion]))、`AuditLog`(id, tenantId, userId, action String, detail Json?, createdAt; @@index([tenantId, createdAt]))。所有业务表（Machine/Session/Round/Posterior/SimParams/BanditArm/McSimCache/AuditLog）均含 `tenantId String @db.Uuid` 并 `@@index([tenantId])`。
6. `pnpm prisma migrate dev --name init` 生成首次迁移。在生成的迁移 SQL **末尾追加** RLS 策略（手写 SQL，版本化）：对 Machine/Session/Round/Posterior/SimParams/BanditArm/McSimCache/AuditLog 每张表执行 `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY; ALTER TABLE <t> FORCE ROW LEVEL SECURITY; CREATE POLICY tenant_isolation ON <t> USING (tenant_id = current_setting('app.current_tenant')::uuid) WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);`。另建 `CREATE INDEX IF NOT EXISTS idx_<t>_tenant ON <t>(tenant_id);`。注释说明 GlobalPrior/Membership/Tenant/User 不加 RLS（全局表/无 tenant_id）。
7. 配置 PG 角色脚本 `prisma/sql/01-app-role.sql`（仅文档化，由 docker 初始化或手动执行）：创建普通角色 `pinball_app` 无 BYPASSRLS，授予表 RW 权限。说明生产须执行此脚本使连接角色非 superuser。

### M1.3 数据层与租户隔离
8. 创建 `lib/db/prisma.ts`：导出单例 `prisma`（`new PrismaClient()`，开发环境 global 缓存防热重载多实例）。
9. 创建 `lib/db/tenant.ts`：导出 `withTenant<T>(tenantId: string, fn: (tx: PrismaTransaction) => Promise<T>): Promise<T>`，实现 `prisma.$transaction(async (tx) => { await tx.$executeRaw\`SELECT set_config('app.current_tenant', ${tenantId}, true)\`; return fn(tx); })`。导出 `PrismaTransaction = Prisma.TransactionClient` 类型。注释强调 `true`=事务本地，防连接池串租户。
10. 创建 `lib/db/repo.ts`：租户绑定仓储，每个函数签名第一参为 `tx: PrismaTransaction`（不接裸 tenantId 以外查询），含 `createMachine/updateMachine/listMachines/getMachine/deleteMachine`、`createSession/listSessions/getSession/closeSession`、`getRound/listRounds`。所有查询天然受 RLS 保护。`deleteMachine` 依赖 schema `onDelete: Cascade`（Session/Round/Posterior/SimParams/BanditArm 级联）。
11. 创建 `lib/types.ts`：`Multiplier`、`PowerLevel`、`Machine`、`Session`、`Round`、`Posterior`、`SimParams`、`BanditArm` 接口（与 Prisma 生成类型对齐，按需 `export type`）。

### M1.4 认证：Auth.js v5 + 邮箱 OTP + OAuth
12. 创建 `lib/auth/config.ts`：Auth.js v5 配置。Providers：`Credentials`（邮箱+密码，回调内 `argon2.verify(user.passwordHash, password)`，校验通过返回 `{id, email}`；用户不存在或密码空→null）、`Google`、`GitHub`（OAuth，env `AUTH_GOOGLE_ID/SECRET`、`AUTH_GITHUB_ID/SECRET`）。`session.strategy='jwt'`；`jwt` 回调从 account/user 注入 `userId`、`tenantId`（首次登录无 tenantId 时在 `signIn` 回调内解析/创建默认个人租户，见 M1.5）。`callbacks.authorized` 仅做未认证粗拦截（路由级），对象级授权下沉数据层。`pages.signIn='/login'`。
13. 创建 `lib/auth/password.ts`：`hashPassword(pw): Promise<string>`（`argon2.hash(pw, {type: argon2.argon2id, memoryCost:19456, timeCost:2, parallelism:1})`）、`verifyPassword`。
14. 创建 `lib/auth/otp.ts`：`generateOtp(): string`（6 位数字）、`storeOtp(email, code)`（用 Prisma 表 `OtpCode` 或复用 `VerificationToken`，TTL 10 分钟，`lib/db` 单条记录 email+code+expiresAt）、`verifyOtp(email, code): boolean`。OTP 发送：`lib/auth/email.ts`，`sendOtpEmail(email, code)`；实现优先 Resend（env `RESEND_API_KEY`），否则 `nodemailer` SMTP（env `EMAIL_SERVER`/`EMAIL_FROM`）；开发环境 `EMAIL_MODE=console` 时只 `console.log` 不真发。在 `prisma/schema.prisma` 追加 `OtpCode` 模型（id, email @db.Citext, code String, expiresAt DateTime, consumed Boolean @default(false); @@index([email, code])）并迁移 `pnpm prisma migrate dev --name otp`。
15. 创建 `app/api/auth/[...nextauth]/route.ts`：`export { GET, POST } from '@/lib/auth/config'`（Auth.js v5 App Router 形式，config 在 `lib/auth.config.ts` 与 `lib/auth/config.ts` 拆分以兼容 middleware 只导入无密钥的 config）。
16. 创建 `middleware.ts`：`export { default } from "next-auth/middleware"`，`matcher` 排除 `/login`、`/register`、`/api/auth/*`、`/_next`、`/favicon.ico`。注释：仅粗粒度，非安全边界。
17. 创建 `app/(auth)/login/page.tsx`、`app/(auth)/register/page.tsx`：客户端组件。注册页：邮箱+密码 → 调 `POST /api/auth/register`（Server Action 或 route）发 OTP → 显示 OTP 输入 → 校验成功提示登录。登录页：邮箱+密码表单 + Google/GitHub 按钮（Auth.js `signIn('google'/'github'')`）。
18. 创建 `app/api/auth/register/route.ts`：POST `{email, password}` → zod 校验（邮箱格式、密码≥8 位）→ 查重 → `hashPassword` → `generateOtp` + `storeOtp` → `sendOtpEmail` → 返回 `{otpSent:true}`。创建 `app/api/auth/verify-otp/route.ts`：POST `{email, password, code}` → `verifyOtp` → 成功则单事务建 `User`+`Tenant`(个人, name=email)+`Membership`(role owner) → 返回可登录态（或返回提示让前端调 `signIn('credentials')`）。**注册与建租户在同一 `$transaction` 内**，失败全回滚。

### M1.5 租户解析与机台/Session CRUD
19. 创建 `lib/auth/tenant-resolve.ts`：`getTenantIdForUser(userId): Promise<string>`（查 `Membership` 取第一个 owner 租户，未来团队切换时刷新 JWT）。在 Auth.js `signIn`/`jwt` 回调调用，写入 token.tenantId。Server 端取当前租户：`lib/auth/session.ts` 的 `getCurrentTenantId(): Promise<string>`（从 `auth()` 读 token.tenantId，无则抛 401）。
20. 创建 `app/(app)/page.tsx`（RSC 机台列表）：`auth()` 取 session → `getCurrentTenantId` → `withTenant(tid, tx => repo.listMachines(tx))`。渲染机台卡片列表 + 「新建机台」按钮（链接 `/machine/new` 或 modal）。
21. 创建机台 CRUD：`app/api/machines/route.ts`（POST 建机台：zod 校验 code/name/venue/holeCount/holeNumbering → `withTenant` → `repo.createMachine`；GET 列表）。`app/api/machines/[id]/route.ts`（GET/PATCH/DELETE）。机台编辑 UI `app/(app)/machine/[id]/page.tsx`（RSC 详情 + Session 列表 + 机台统计汇总）。新建机台表单组件 `components/machine/MachineForm.tsx`。
22. 创建 Session CRUD：`app/api/sessions/route.ts`（POST 建 Session：body machineId → `withTenant` → `repo.createSession` 自动编号 startedAt=now status=active；GET 按 machineId 列表）。`app/api/sessions/[id]/route.ts`（GET 详情含 rounds 概览；PATCH 关闭 Session status=closed endedAt=now）。UI `app/(app)/session/[id]/page.tsx` 占位（M2 填录入入口）。

### M1.6 测试（M1 验收）
23. 创建 `tests/rls.test.ts`（Vitest 集成，需 `DATABASE_URL` 指向测试库）：fixture 建两个租户 tA/tB 各建机台 m_A/m_B；用 `withTenant(tA, ...)` 写数据后，`withTenant(tB, ...)` 查 m_A 必须返回 null/0 行；`withTenant(tB)` 直接 insert tenantId=tA 的 round 必须抛 RLS 错误（WITH CHECK 拒绝）。断言交叉访问恒 0 行。
24. 创建 `tests/auth.test.ts`：注册→发 OTP（console 模式读日志拿 code）→验证→建 User+Tenant+Membership 事务成功；重复邮箱注册失败；密码 Argon2id 校验。
25. 验收命令：`docker compose up -d postgres pgbouncer redis` → `pnpm prisma migrate deploy` → `pnpm prisma db seed`（建测试租户，seed 脚本 `prisma/seed.ts`）→ `pnpm vitest run tests/rls.test.ts tests/auth.test.ts` → 手动 `pnpm dev` 走 注册→登录→建机台→建 Session（OAuth 与邮箱各一次）。

---

## M2 录入流：EntryWizard + 事务 + 离线幂等

> 验收：E2E 录入流（建机台→建Session→录3局）绿；断网→本地队列→恢复自动同步不重复；编辑/撤销后统计与模型计数一致；单局录入≤6次点按。

### M2.1 规则与 schema
26. 创建 `lib/rules.ts`：导出常量（见全局约定）+ 函数 `litCountFor(multiplier): number`、`isHit(landHole, litHoles): boolean`、`computeReward(totalBet, multiplier, hit): number`（hit? totalBet*multiplier : 0）、`computeCards(reward): number`（`Math.min(CARD_MAX, Math.floor(reward/CARD_THRESHOLD))`）、`defaultExtraBet=0`。
27. 创建 `lib/schemas.ts`：zod schema `RoundInputSchema`（multiplier z.enum([2,4,6,8,10])、litHoles z.array(z.number().int().min(1).max(12))、superRefine 校验 `litHoles.length === litCountFor(multiplier)`、baseBet、extraBet、power z.enum(['low','mid','high'])、landHole z.number().int().min(1).max(12)、clientRequestId z.string()）。`MachineSchema`、`SessionSchema`。前后端共享。

### M2.2 录入接口与事务
28. 创建 `app/api/rounds/route.ts` POST：入参 `RoundInputSchema.safeParse` → 失败 400。`withTenant(tid, async tx => { const existing = await tx.round.findUnique({where:{tenantId_sessionId_clientRequestId:{...}}}); if(existing) return existing; // 幂等 })`。新记录事务：①`computeReward`/`computeCards`/`isHit` 算派生字段 ②`tx.round.create` ③`tx.session.update` 冗余统计（roundCount/totalBet/totalWin/cards +=）④L1 `updatePosterior(tx, machineId, power, landHole)` ⑤L3 `updateBanditArm(tx, machineId, power, hit)`（M3 实现，此处先调 stub 占位接口 `lib/predict/posterior.ts`/`bandit.ts` 的 update，确保事务边界已含）。返回完整 round。
29. 创建 `app/api/rounds/[id]/route.ts` PATCH（编辑）：入参 partial RoundInput + roundId。事务内：读旧 round → `revertPosterior`/`revertBanditArm`（反向计数）→ 回滚 session 统计 → 应用新值正向更新 → `round.update` 标 `edited=true, modelVersion+=1`。DELETE（撤销最后一局）：反向回滚 + `round.delete` + session 统计回滚 + modelVersion+=1。两者均在同 `$transaction`。
30. 创建 `lib/predict/posterior.ts`（M3 完整实现，M2 先建 `updatePosterior`/`revertPosterior` 的 counts±1 落库版）：`updatePosterior(tx, machineId, power, hole)` upsert Posterior `counts[hole-1]+=1`；`revertPosterior` 反向。`lib/predict/bandit.ts` 同理 `updateBanditArm(tx, machineId, power, hit)`：hit→alpha+=1 else beta+=1；`revertBanditArm` 反向。确保 M2 事务可跑通（算法逻辑 M3 补齐）。

### M2.3 EntryWizard 组件
31. 创建 `components/entry/EntryWizard.tsx`（Zustand store `lib/stores/entry-store.ts` 管理步骤状态）：6 步向导 ①MultiplierPicker（5 个倍率钮，auto-advance）②HoleBoard（12 圆钮按物理布局一行或两行，按当前倍率限定可选数=LIT_COUNT，亮灯态高亮）③ExtraBetStepper（0..加注上限，默认0）④PowerPicker（low/mid/high 大钮）⑤落点 HoleBoard（落点态视觉区别于亮灯）⑥auto 判中（可覆写）+ 提交。提交后重置开下一局。顶部常驻 Session 累计投入/中奖/净盈亏（从 session 冗余统计读）。
32. 创建子组件 `MultiplierPicker.tsx`、`HoleBoard.tsx`（props: mode 'lit'|'land', multiplier, value, onChange, maxSelect）、`ExtraBetStepper.tsx`、`PowerPicker.tsx`、`components/ui/TouchButton.tsx`（≥48px 基础大触控钮）。Tailwind 移动端优先样式。
33. 创建 `app/(app)/session/[id]/play/page.tsx`：客户端组件，挂 EntryWizard，初始化读 session 概览。`components/entry/RecommendSheet.tsx` 与 `MonteCarloPanel.tsx` 在 M3/M4 接入，M2 预留挂载点（样本<20 时不渲染推荐）。

### M2.4 离线 outbox 与幂等
34. 创建 `lib/offline/outbox.ts`：基于 localStorage 的队列（key `pinball_outbox`）。`enqueue(roundInput)` 生成 `clientRequestId=crypto.randomUUID()` 存入；`flush()` 逐条 POST `/api/rounds`（带 clientRequestId 幂等），成功出队，失败保留+退避。监听 `online` 事件触发 flush。
35. EntryWizard 提交逻辑：先尝试 `fetch('/api/rounds')`；网络失败（`!navigator.onLine` 或 fetch throw）→ `enqueue` + UI 标记「已暂存，恢复后同步」+ 本地乐观更新 session 统计。`lib/offline/sync.ts` 在 app 挂载时若 `navigator.onLine` 且队列非空自动 flush。

### M2.5 测试（M2 验收）
36. 创建 `tests/rounds.test.ts`：录入事务幂等（同 clientRequestId 两次提交只产 1 行）；编辑历史局后 session 统计与 posterior counts 一致；撤销最后一局回滚正确。
37. 创建 `tests/e2e/entry-flow.spec.ts`（Playwright 390×844）：注册→建机台→建Session→录 3 局→校验 session 统计；断网（`context.setOffline(true)`）录 2 局→恢复→自动同步不重复；满 20 局（seed 脚本批量录入）后出现推荐入口占位。
38. 验收命令：`pnpm vitest run tests/rounds.test.ts` → `pnpm playwright test tests/e2e/entry-flow.spec.ts`。手动验收单局录入点按次数 ≤6。

---

## M3 算法栈 L1+L3+L4 + 推荐

> 验收：合成偏态机台 100 局收敛到真最优档；Thompson 双档接近时不锁死（探索率>0）；满 20 局解锁推荐双轨 UI；样本不足降级为先验并标注。

### M3.1 L1 Dirichlet 后验（补齐）
39. 完善 `lib/predict/posterior.ts`：`estimate(counts, litHoles?): number`（命中概率 = Σ_{h∈L}(α_h)/Σα，α=counts+α0；litHoles 缺省返回各通道分布数组）。`dirichletMean(counts): number[]`（后验均值）。α0 先验强度来源 M3.3 L4；L4 未就绪时 α0=1（均匀）。文档注释在线更新/回滚已在 M2 事务内。

### M3.2 L3 Thompson 采样
40. 创建 `lib/predict/bandit.ts`：`recommend(tx, machineId, litHoles): Promise<RecommendResult>`。读三档 BanditArm + 对应 Posterior；每臂诱导 Beta(Σ_{h∈L}α_{a,h}, Σ_{h∉L}α_{a,h})，其中 α 来自 L1 posterior counts+α0。采样 K=2000 次（`seedrandom` 或 `mulberry32`，seed=machineId+litHoles 哈希保证可复现）→ 统计各臂 `bestArmProb = count(a==argmax)/K`。`thompsonPower = argmax(bestArmProb)`、`argmaxPower = argmax(θ̂_a 点估计)`。`degraded = bestArmProb[thompson] < 0.55`。`expectedReturn`：每臂 θ_a × totalBet × multiplier（用当前 session 默认投入）取推荐臂。返回 `{thompsonPower, argmaxPower, bestArmProb:[3], degraded, expectedReturn, channelProb:number[12]}`（channelProb 取推荐臂 L1 后验均值）。`updateBanditArm`/`revertBanditArm` 在 M2 已建。

### M3.3 L4 层次贝叶斯部分池化
41. 创建 `lib/predict/pooling.ts`：`aggregateGlobalPrior()`：跨租户汇总匿名（machineId 哈希化、无 userId）(power, hole) 计数 → 写 `GlobalPrior` 表（per power: counts[12] + sampleN）。排除关闭「贡献匿名统计」的租户（Membership 或 User 加字段 `contributeAnonymous Boolean @default(true)`，迁移 `pnpm prisma migrate dev --name anon-pref`）。`priorForMachine(power, sampleN): number[]`：α0 = 15 × P̄_power（全局归一化分布）；当 sampleN 增长权重 n/(n+15) 自动滑向机台个性。`initPosteriorWithPrior(tx, machineId, power)`：新档位 posterior 初始化为 α0（存 GlobalPrior counts × 15 / sampleN 归一化）。聚合任务由 BullMQ 定时 job（M4 一起接 worker，M3 先提供函数 + 手动触发 API `app/api/admin/aggregate-prior/route.ts`）。

### M3.4 推荐接口与 UI
42. 创建 `app/api/recommend/route.ts` POST `{machineId, multiplier, litHoles}`：校验 litHoles.length===litCountFor(multiplier)。`withTenant` → 查该机台总样本数（Σ三档 counts）。样本 < SAMPLE_THRESHOLD(20) → 返回 `{degraded:true, mode:'prior', ...priorForMachine 估计}` 并标注「样本不足，已降级为先验」。≥20 → `bandit.recommend`。同时把推荐结果（recommendedPower/recommendMode）暂存供录入时写入 round（回测用）。
43. 创建 `components/entry/RecommendSheet.tsx`：抽屉式不阻塞流程。展示：Thompson 推荐档位 + 置信度（bestArmProb 条形）+ argmax 对照（一致标「高置信」，不一致提示「建议按 Thompson 执行以加速学习」）+ 12 通道概率热力条 + 亮灯联合命中概率 + 期望返还。`degraded` 时显示「正在探索/各档无显著差异」或「样本不足，已降级为先验」。在 play 页 step② 后（满20局）弹出。
44. 录入流接入：EntryWizard step② 完成后若 session 样本≥20，自动 fetch `/api/recommend` 填充 RecommendSheet；录入 round 时把当时 recommendedPower/recommendMode 一并写入（已在 M2.2 round.create 字段）。

### M3.5 测试（M3 验收）
45. 创建 `tests/predict.test.ts`：①posterior update/revert 幂等（更新后 revert 回原值）。②合成偏态机台（high 档命中率 0.6，low/mid 0.3）模拟 100 局，Thompson 推荐 high 的比例随局数趋 >0.8。③双档接近（0.45 vs 0.5）时 100 局内两档都被采样（探索率>0，不锁死）。④L4 先验：空机台 estimate 返回全局形态非均匀。⑤满 20 局解锁 vs 19 局降级标注。
46. 验收命令：`pnpm vitest run tests/predict.test.ts`；手动 `pnpm dev` 录满 20 局后看 RecommendSheet 双轨展示。

---

## M4 L2 蒙特卡洛 + 统计页 + BullMQ worker

> 验收：蒙特卡洛同 seed 可复现；拟合能恢复注入的 pegBias；1000 局统计页渲染 <500ms；χ²/校准/regret/对数似然可视化。

### M4.1 L2 蒙特卡洛
47. 创建 `lib/predict/montecarlo.ts`：盘面模型 12 行钉，单钉右偏概率 p（Bernoulli），发力档位 → (entryOffset, spread)。`simulate(params, N=10000, seed): {dist:number[12], stderr:number[12]}`（N 次弹道，落点按 entryOffset+spread 平移+缩放后取最近通道；stderr≈√(p̂(1-p̂)/N)）。`fit(landHoles: number[], powers: PowerLevel[]): SimParams`：样本≥30 时网格搜索（p∈[0.3,0.7] step 0.01 × offset∈[-2,2] step 0.5 × spread∈[0.8,1.3] step 0.05）最小化 KL(实测‖模拟)；不足用全局均值参数。种子 seed = hash(machineId + fitVersion) 保证可复现。
48. 创建 BullMQ worker `lib/queue/montecarlo-worker.ts`：队列 `montecarlo`，job `{tenantId, machineId, power, fitVersion}`。worker 内 `withTenant` 读该档 rounds 落点 → `fit` → `simulate` N=10000 → upsert `SimParams` + `McSimCache`(fitVersion, dist, stderr)。Redis 连接 `lib/queue/redis.ts`（`new Queue`/`new Worker`，url=REDIS_URL）。录入事务结束时（M2 round POST 成功后）若该机台该档样本跨越 30/50/100 阈值 → `queue.add` 触发重拟合（不阻塞响应，TECH-PLAN §4.3）。Docker app 容器 `CMD` 启动 Next + worker（或 compose 加 `worker` service 复用 image 跑 `pnpm worker`）。
49. 创建 `app/api/montecarlo/route.ts` GET `{machineId, power?}`：读 `McSimCache`（按 fitVersion）；无缓存或需重拟合 → `queue.add` 返回 `{pending:true}`，前端轮询或下一局读到。`components/entry/MonteCarloPanel.tsx`：可展开面板，展示模拟分布 vs 实测分布柱状对比 + 误差棒 + χ² 失拟提示（p<0.01 时显示「该机台偏离理想盘面，以实测统计为准」）。

### M4.2 评估模块
50. 创建 `lib/predict/evaluate.ts`：`calibration(rounds)`：预测命中概率分桶（0-1 分 10 桶）vs 实际命中率。`backtest(rounds)`：重放「采纳 recommendedPower vs 实际 power」期望净盈亏差。`regretCurve(rounds)`：Thompson 累计后悔（每局最优臂 θ* − 实际臂 θ）随局数。`chiSquare(observed, expected)`：实测 vs L2 模拟 / vs 均匀。`logLikelihoodRolling(rounds)`：L1 vs L2 one-step-ahead 滚动对数似然。

### M4.3 统计页
51. 创建 `app/(app)/stats/page.tsx`（RSC）：`withTenant` 读全租户数据（按 machineId/session 聚合）。组件 `components/stats/`：`MachineCompareChart`（机台对比）、`PowerMultiplierMatrix`（发力×倍率命中率热力矩阵）、`LandDistributionChart`（落点直方图+理论二项/正态叠加，Recharts）、`PnlTrendChart`（盈亏趋势）、`CalibrationChart`、`BacktestChart`、`RegretChart`、`ChiSquarePanel`、`LogLikelihoodChart`。1000 局渲染 <500ms：RSC 直出 + 虚拟列表（`components/ui/VirtualList.tsx`，用 `@tanstack/react-virtual`）明细流水。
52. Session 小结 `app/(app)/session/[id]/summary/page.tsx`：局数/投入/中奖/净盈亏/积分卡/命中率/分组命中率。明细流水虚拟列表。

### M4.4 测试（M4 验收）
53. 扩展 `tests/predict.test.ts`：蒙特卡洛同 seed 两次结果严格相等；`fit` 注入 pegBias=0.6 能恢复（误差<0.05）；模拟分布与注入参数的 Binomial 理论分布 KL<0.05。
54. 性能验收：seed 脚本灌 1000 局 → `pnpm playwright test` 测统计页 DOMContentLoaded <500ms（`page.metrics`）。
55. 验收命令：`docker compose up -d`（含 worker）→ `pnpm vitest run` → 录入触发蒙特卡洛 job 完成 → 查看 MonteCarloPanel 与统计页全套图表。

---

## M5 打磨发布：团队租户 + 导出 + 审计 + 部署

> 验收：团队邀请走通；导出 JSON/CSV 本租户全量；注销物理删租户数据；审计日志记录登录/导出/删除；Docker 一键起服务；安全 checklist 全过。

### M5.1 团队租户
56. 创建 `app/api/tenants/route.ts`（POST 建团队租户 + owner membership；GET 我的租户列表）、`app/api/tenants/[id]/invite/route.ts`（POST 邀请成员：生成邀请 token，邮件/链接，接受后建 membership role=member）、`app/api/tenants/[id]/members/route.ts`（GET 成员列表；PATCH 改角色；DELETE 移除）。租户切换：`app/api/auth/switch-tenant/route.ts` 刷新 JWT tenantId。UI `components/settings/TenantManager.tsx` 在设置页。RLS 保证团队内共享、跨团队隔离。

### M5.2 数据导出与注销
57. 创建 `app/api/export/route.ts` GET：`withTenant` 导出本租户全量 machines/sessions/rounds 为 JSON；`?format=csv` 时各表 CSV。响应触发审计日志 `AuditLog(action='export')`。
58. 创建 `app/api/account/delete/route.ts` DELETE：`withTenant` 删 tenant（Cascade 物理删 machines/sessions/rounds/posteriors/sim_params/bandit_arms/mc_sim_cache/audit_logs）+ 删 user。审计日志在删除前落库（或先写到独立留存）。UI 设置页「注销账号」二次确认。

### M5.3 审计、提醒、部署
59. 创建 `lib/audit.ts`：`logAudit(tx, userId, action, detail?)` 写 AuditLog。在登录成功、导出、删除、撤销/编辑 round 处调用。
60. 创建 `components/ui/DisclaimerBanner.tsx`：常驻「结果本质随机，历史统计不构成未来保证」+ 未成年人提示。设置页理性提醒开关（User 字段 `rationalReminder Boolean @default(true)`，迁移）。免责声明常驻（PRD F5.3）。
61. 部署：完善 `Dockerfile` 多阶段构建（deps/build/runtime 分层减体积）；`docker-compose.yml` 加 `worker` service（同 image，command `pnpm worker`，depends_on redis）；`README.md` 写一键 `docker compose up -d` + `pnpm prisma migrate deploy` + 环境变量说明。生产 checklist：HTTPS 全链路、连接角色非 BYPASSRLS、登录/录入速率限制（`lib/rate-limit.ts` 基于 Redis 滑动窗口）、密码 Argon2id、JWT 过期。
62. 安全集成测试扩展 `tests/rls.test.ts`：未认证遍历全部 `/api/*` 路由断言 401；团队租户 A 成员不能访问团队租户 B 数据；注销后原 token 失效、数据物理删除（查表为空）。

---

## Critical files & anchors

- `prisma/schema.prisma` — 全部模型 + tenant_id；M1.2 建，M1.4/M3.3/M5 追加字段（OtpCode/contributeAnonymous/rationalReminder）。RLS policy SQL 在迁移末尾手写追加。
- `lib/db/tenant.ts` — `withTenant` 唯一数据入口；RLS 双层防护的应用层。所有 repo 函数第一参 `tx`。
- `app/api/rounds/route.ts` — 录入幂等事务（round+session统计+L1+L3 同事务）；M2.2 核心幂等键 `clientRequestId`。
- `lib/predict/bandit.ts` — L3 Thompson 采样推荐核心；K=2000 采样、bestArmProb、degraded 阈值 0.55、双轨（thompson vs argmax）。
- `lib/predict/montecarlo.ts` + `lib/queue/montecarlo-worker.ts` — L2 蒙特卡洛拟合+模拟+可复现种子；BullMQ worker 异步执行不阻塞录入。

## Verification（端到端）

1. **环境**：`docker compose up -d`（postgres+pgbouncer+redis+app+worker）；`cp .env.example .env` 填 OAuth 凭据（Google/GitHub OAuth App，回调 `http://localhost:3000/api/auth/callback/{provider}`）与 `EMAIL_MODE=console`。
2. **M1 验收**：`pnpm prisma migrate deploy && pnpm prisma db seed` → `pnpm vitest run tests/rls.test.ts tests/auth.test.ts`（RLS 交叉访问 0 行、注册→OTP→建租户事务）。手动：邮箱注册（控制台读 OTP）+ Google/GitHub 登录各一次 → 建机台 → 建 Session。
3. **M2 验收**：`pnpm playwright test tests/e2e/entry-flow.spec.ts`（mobile 390×844）：录 3 局统计正确；断网录 2 局→恢复同步无重复；编辑/撤销后统计与模型一致。手动验收单局 ≤6 点按。
4. **M3 验收**：`pnpm vitest run tests/predict.test.ts`（合成偏态 100 局收敛最优档、双档接近不锁死探索率>0、L4 先验非均匀、20 局解锁/19 局降级）。手动录满 20 局看 RecommendSheet 双轨+置信度+12 通道热力条。
5. **M4 验收**：`pnpm vitest run tests/predict.test.ts`（蒙特卡洛同 seed 严格相等、fit 恢复 pegBias 误差<0.05）。性能：seed 1000 局 → Playwright 测统计页 <500ms。手动看 MonteCarloPanel 模拟vs实测+误差棒+χ²提示，统计页全套图表。
6. **M5 验收**：`pnpm vitest run tests/rls.test.ts`（未认证 401、跨团队隔离、注销后数据空）。手动：建团队→邀请成员→切换租户；导出 JSON/CSV；注销账号确认数据物理删除；`docker compose up -d` 一键起全服务。
7. **全量收尾**：`pnpm lint && pnpm typecheck && pnpm test`（Vitest+Playwright）全绿。

## Assumptions & contingencies

- **包管理器 pnpm**、**PG 角色非 BYPASSRLS**、**PgBouncer transaction 模式**、**OTP 开发 console 生产 SMTP/Resend（env 驱动）**：均为 TECH-PLAN 已定或合理默认，无需用户确认。
- **OAuth 凭据**：M1 执行前需你在 Google Cloud / GitHub 配置 OAuth App 并填 `.env`；若暂无凭据，M1.4 OAuth 流程可跳过手动验收，但代码与 callback 路由仍须就位（`AUTH_GOOGLE_*`/`AUTH_GITHUB_*` 为空时 provider 不启用，不阻塞 M1 其余验收）。
- **蒙特卡洛阈值触发重拟合**：M4.2 在样本跨越 30/50/100 时入队重拟合 job。若 BullMQ worker 未起（本地仅 `pnpm dev`），McSimCache 不更新但不阻塞录入；MonteCarloPanel 显示「待计算」。
- **部署形态锁定 Docker 全栈**（用户已选）：若后续改 serverless，蒙特卡洛须从 BullMQ 改为 `after()`/QStash + DB 缓存，PgBouncer 替换为 serverless driver（Neon/Vercel Postgres）+ 事务内 set_config 兼容性需重验——此为替代路径，不影响当前计划执行。
- **认证含 OAuth**（用户已选）：M1 即集成 Google+GitHub，较纯邮箱方案 +1 天；若 OAuth 凭据获取受阻，可临时降级为仅邮箱+OTP 推进 M1，OAuth provider 代码保留待凭据就绪后启用。
- **洞口数 12**（PRD §1.1 图像分析纠正了 note-tips 的 10）：以 PRD/TECH-PLAN 为准，`HOLE_COUNT=12`。
- **L4 全局聚合隐私**：仅匿名计数（machineId 哈希、无 userId），用户可关闭贡献（`contributeAnonymous` 字段）；隐私政策页 M5 补充（PRD F5.3/合规）。
