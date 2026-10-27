<div align="center">

# 幻想兔 · 弹珠机预测系统

**多租户 SaaS 化弹珠机个人统计分析工具**

注册登录 → 机台建档 → 向导式快速录入对局 → 满 20 局后基于四层算法栈给出发力档位推荐与通道概率 → 复盘统计

[Next.js 15](https://nextjs.org) · [Prisma 6](https://www.prisma.io) · [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) · [Auth.js v5](https://authjs.dev) · [BullMQ](https://docs.bullmq.io) · [Vitest](https://vitest.dev) · [Playwright](https://playwright.dev)

</div>

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [架构概览](#架构概览)
- [快速开始](#快速开始)
  - [方式一：Docker 一键部署](#方式一docker-一键部署)
  - [方式二：本地开发环境](#方式二本地开发环境)
- [本机测试指南](#本机测试指南)
  - [环境前置条件](#环境前置条件)
  - [第一步：准备数据库](#第一步准备数据库)
  - [第二步：配置环境变量](#第二步配置环境变量)
  - [第三步：运行测试](#第三步运行测试)
  - [第四步：端到端冒烟验证](#第四步端到端冒烟验证)
- [测试体系说明](#测试体系说明)
- [环境变量](#环境变量)
- [项目结构](#项目结构)
- [安全设计](#安全设计)
- [部署](#部署)
- [常见问题](#常见问题)
- [License](#license)

---

## 功能特性

| 模块 | 说明 |
| --- | --- |
| **多租户隔离** | 应用层 `withTenant`（事务内 `set_config`）+ 数据库 RLS 双层强制，8 张业务表 `FORCE ROW LEVEL SECURITY`（对表属主同样生效） |
| **认证体系** | Auth.js v5：邮箱 + OTP 验证码为主链，Google/GitHub OAuth 可选启用（凭据留空自动降级）；密码 Argon2id |
| **向导式录入** | 6 步触屏向导（倍率 → 亮灯通道 → 加注 → 发力 → 落点 → 确认），单局点按 ≤ 6 次 |
| **幂等录入** | `clientRequestId` 唯一约束 + 事务，重复提交不双写；支持编辑（回滚重放）与撤销（仅末局） |
| **离线容错** | localStorage outbox 队列，断网暂存、恢复后幂等重放，不丢局不重复 |
| **四层算法栈** | L1 Dirichlet 后验 · L2 蒙特卡洛高尔顿板（BullMQ 异步重拟合） · L3 Thompson 采样上下文老虎机 · L4 层次贝叶斯部分池化 |
| **推荐双轨** | Thompson 采样 + 点估计对照，置信度 < 0.55 标注「无显著差异」；样本 < 20 局降级为先验并明示 |
| **复盘统计** | 落点分布直方图、盈亏趋势、模型校准曲线、regret 曲线、发力 × 倍率命中率矩阵、χ² 拟合优度、推荐回测、L1 vs L2 滚动对数似然 |
| **团队协作** | 团队租户、成员邀请（token 链接）、角色管理、租户切换 |
| **数据主权** | JSON/CSV 全量导出；注销账号物理删除全部数据（数据库 Cascade） |
| **审计与限流** | 登录/导出/删除/编辑/撤销/邀请等动作落 `AuditLog`；Redis 滑动窗口登录限流 |

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 15.5（App Router，RSC + Server Actions） |
| 语言 | TypeScript 5.9（strict） |
| ORM | Prisma 6.19（迁移 + Client） |
| 数据库 | PostgreSQL 16+（RLS、`citext`、`pgcrypto`） |
| 认证 | Auth.js v5 beta（JWT session strategy） |
| 队列 | BullMQ 6 + Redis 7（蒙特卡洛重拟合） |
| 前端 | React 19、Tailwind CSS 4、Zustand 5、zod 4、Recharts 3 |
| 测试 | Vitest 5（集成测试连真实 PG）、Playwright 1.64（移动端 E2E） |
| 部署 | Docker 多阶段构建 + docker compose（app / worker / postgres / pgbouncer / redis） |

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 15 (App Router)                                    │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ RSC 页面      │  │ API Routes    │  │ Client Components│  │
│  │ stats/settings│  │ rounds/machines│  │ EntryWizard     │  │
│  │ play/summary │  │ recommend/mc  │  │ RecommendSheet   │  │
│  └──────┬───────┘  └───────┬───────┘  └──────────────────┘  │
│         │                  │                                │
│  ┌──────▼──────────────────▼───────┐                        │
│  │  withTenant(tx) ── 唯一数据入口   │                        │
│  │  set_config('app.current_tenant')│                        │
│  └──────────────┬──────────────────┘                        │
│         ┌───────┴────────┬─────────────┐                    │
│  ┌──────▼─────┐  ┌───────▼──────┐ ┌───▼──────────────┐      │
│  │ L1 Dirichlet│  │ L3 Thompson  │ │ L4 层次池化      │      │
│  │ posterior  │  │ bandit       │ │ pooling(agg角色) │      │
│  └────────────┘  └──────────────┘ └──────────────────┘      │
│  ┌─────────────────────────────┐                            │
│  │ L2 蒙特卡洛 → BullMQ worker │                            │
│  └─────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
                           │
              PostgreSQL (RLS FORCE)  ← 双层隔离
```

---

## 快速开始

### 方式一：Docker 一键部署

```bash
git clone https://github.com/sacrtap/pinball.git
cd pinball/pinball

cp .env.example .env
# 生成 AUTH_SECRET（必填）
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env

docker compose up -d
docker compose exec app pnpm prisma migrate deploy
docker compose exec app pnpm prisma db seed
```

访问 http://localhost:3000 ，使用种子账号登录：

```
邮箱：dev@pinball.local
密码：dev-password-123
```

compose 包含 5 个服务：

| 服务 | 说明 |
| --- | --- |
| `app` | Next.js 应用（端口 3000） |
| `worker` | BullMQ 蒙特卡洛重拟合 worker（同 image，`command: pnpm worker`） |
| `postgres` | PostgreSQL 16，初始化时执行 `prisma/sql/01-app-role.sql` |
| `pgbouncer` | transaction 模式连接池（兼容 RLS 的 `set_config(..., true)`） |
| `redis` | BullMQ 队列 + 限流 |

### 方式二：本地开发环境

**前置**：Node.js ≥ 20、pnpm ≥ 8、PostgreSQL 16+、Redis 7。

```bash
cd pinball/pinball
pnpm install
cp .env.example .env          # 见下方「环境变量」

# 建库 + 应用连接角色（RLS 硬性要求：非 superuser、非 BYPASSRLS）
psql -U postgres -c "CREATE ROLE pinball_app LOGIN PASSWORD 'pinball_app_dev' NOSUPERUSER NOBYPASSRLS;"
psql -U postgres -c "CREATE ROLE pinball_agg LOGIN PASSWORD 'pinball_agg_dev' BYPASSRLS;"
psql -U postgres -c "CREATE DATABASE pinball_dev OWNER pinball_app;"
psql -U postgres -c "CREATE DATABASE pinball_test OWNER pinball_app;"

psql -U pinball_app -d pinball_dev -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -U pinball_app -d pinball_test -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -U postgres -d pinball_dev  -f prisma/sql/01-app-role.sql
psql -U postgres -d pinball_test -f prisma/sql/01-app-role.sql

pnpm prisma migrate deploy    # 两个库都要执行
pnpm prisma db seed
pnpm dev                      # http://localhost:3000
```

> **为什么必须用非 superuser 连接？**
> RLS 的 `FORCE ROW LEVEL SECURITY` 对表属主也生效，但 **superuser 与 `BYPASSRLS` 角色会完全绕过 RLS**。若用超级用户连接，`tests/rls.test.ts` 的「连接角色无 BYPASSRLS 属性」断言会失败——这正是隔离生效的证明。

---

## 本机测试指南

以下步骤在本机（macOS / Linux）从零跑通全部测试，含**真实 PostgreSQL 集成测试**与**Playwright 移动端 E2E**。

### 环境前置条件

| 依赖 | 版本 | 校验命令 |
| --- | --- | --- |
| Node.js | ≥ 20（开发用 24） | `node -v` |
| pnpm | ≥ 8 | `pnpm -v` |
| PostgreSQL | ≥ 16 | `pg_isready` |
| Redis | ≥ 7 | `redis-cli ping` |

```bash
# 一次性确认（应全部通过）
node -v && pnpm -v && pg_isready && redis-cli ping
```

### 第一步：准备数据库

测试需要**独立的 `pinball_test` 库**（Vitest 会 `TRUNCATE` 全表，绝不能用开发库）。

```bash
# 1. 建库（如尚未创建）
psql -U postgres -c "CREATE DATABASE pinball_test OWNER pinball_app;"

# 2. 扩展 + 角色授权
psql -U pinball_app -d pinball_test -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -U postgres -d pinball_test -f prisma/sql/01-app-role.sql

# 3. 应用迁移（含 RLS policies）
DATABASE_URL="postgresql://pinball_app:pinball_app_dev@127.0.0.1:5432/pinball_test?schema=public" \
  pnpm prisma migrate deploy
```

`vitest.config.mts` 默认连接 `127.0.0.1:5432/pinball_test`，端口不同用环境变量覆盖：

```bash
export DATABASE_URL="postgresql://pinball_app:pinball_app_dev@127.0.0.1:5433/pinball_test?schema=public"
```

> **macOS + Postgres.app 特别注意**：Postgres.app 托管实例带 `auth_permission_dialog` 共享库，会**阻塞后台进程（如 `next start`、Playwright）的 TCP 连接**（前台终端不受影响）。若集成测试报 `Can't reach database server`，请改用无该库的 PG 实例（例如用 Postgres.app 自带二进制 `initdb` 一个独立端口的实例）。

### 第二步：配置环境变量

```bash
cp .env.example .env
```

测试相关的关键项：

```bash
# .env（开发/测试）
DATABASE_URL="postgresql://pinball_app:pinball_app_dev@127.0.0.1:5432/pinball_dev?schema=public"
DIRECT_DATABASE_URL="postgresql://pinball_app:pinball_app_dev@127.0.0.1:5432/pinball_dev?schema=public"
REDIS_URL="redis://127.0.0.1:6379"
AUTH_SECRET="$(openssl rand -base64 32)"
EMAIL_MODE="console"          # OTP 验证码打到服务端日志，不发真实邮件
ENABLE_TEST_ROUTES="true"     # 开启 /api/test/register（仅 E2E 建账号用，生产必须 false）
```

> `ENABLE_TEST_ROUTES=true` 时暴露 `POST /api/test/register`，用于 E2E 跳过 OTP 邮件流直建账号。**生产环境切勿开启。**

### 第三步：运行测试

#### 3.1 静态检查与单元/集成测试

```bash
pnpm install

pnpm lint          # ESLint（eslint-config-next）
pnpm typecheck     # tsc --noEmit，strict 模式

pnpm test          # Vitest：4 个文件 28 项（1 项条件跳过）
```

`pnpm test` 覆盖：

| 文件 | 用例数 | 断言重点 |
| --- | --- | --- |
| `tests/rls.test.ts` | 7 | 双租户交叉访问恒 0 行、跨团队插入被拒、RLS 对属主生效（FORCE）、连接角色无 BYPASSRLS、注销后物理删除查表为空 |
| `tests/auth.test.ts` | 4 | Argon2id 哈希、OTP 6 位数字且一次性、注册→OTP→同事务建 User+Tenant+Membership、重复邮箱失败 |
| `tests/rounds.test.ts` | 6 | 规则口径（亮灯数=倍率映射、奖励=投入×倍率、卡片 floor 上限 5）、幂等只 1 行、update→revert 回原值、编辑统计一致、撤销回滚 |
| `tests/predict.test.ts` | 11 | L1 数值、收敛（>0.8）、双档不锁死（探索率 >0）、L4 先验非均匀、同 seed 严格相等、fit 恢复 pegBias 误差 <0.05、模拟 vs 理论二项 KL <0.05、评估模块 |

单文件调试：

```bash
pnpm test tests/rls.test.ts        # 只跑 RLS
pnpm test:watch                    # watch 模式
```

> 集成测试共享同一个 `pinball_test` 库且各自 `TRUNCATE`，`vitest.config.mts` 已设 `fileParallelism: false` 强制串行，**不要改回并行**。

#### 3.2 端到端测试（Playwright）

E2E 需要**生产构建 + 运行中的服务**（mobile 390×844 视口，Pixel 7 设备）：

```bash
pnpm build
pnpm start &                       # 或 pnpm dev

pnpm playwright test               # 默认连 http://localhost:3000
```

覆盖两条关键链路：

1. **建机台 → 建 Session → 录 3 局统计正确**（真实点击 6 步向导，校验累计统计）
2. **断网录 2 局 → 恢复 → 自动同步不重复**（`context.setOffline` 验证 outbox 重放与幂等）

指向其他地址：

```bash
TEST_BASE_URL=http://localhost:3000 pnpm playwright test
```

查看 HTML 报告：

```bash
pnpm playwright test --reporter=html
pnpm playwright show-report
```

#### 3.3 全量验收（一条命令）

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

### 第四步：端到端冒烟验证

起服务后，按 PRD 主链路走一遍（与 `pnpm playwright test` 等价的真实交互）：

```bash
pnpm build && pnpm start &
sleep 8
```

1. **注册**：访问 http://localhost:3000/register ，填邮箱密码 → OTP 验证码打在服务端日志（`EMAIL_MODE=console`）→ 验证通过自动建 User + Tenant + Membership。
2. **登录**：http://localhost:3000/login ，登录后 JWT 携带 `userId` + `tenantId`。
3. **建机台**：首页 → 新建机台（code 唯一，如 `SMOKE-1`）。
4. **建 Session**：机台详情 → 开始新对局。
5. **录 ≥ 20 局**：6 步向导逐局录入；满 20 局后发力步骤自动弹出推荐抽屉。
6. **查看推荐**：`RecommendSheet` 展示 Thompson 推荐档位、置信度条形、12 通道概率热力条、亮灯联合命中概率、期望返还。
7. **统计页**：http://localhost:3000/stats 查看落点分布、盈亏趋势、校准曲线、regret、发力×倍率矩阵。
8. **设置页**：http://localhost:3000/settings 验证租户切换、成员邀请、导出 JSON/CSV、免责声明。

命令行冒烟（无需浏览器）：

```bash
# 登录拿 cookie
curl -s -c /tmp/c.txt http://localhost:3000/api/auth/csrf \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])" > /tmp/csrf
curl -s -b /tmp/c.txt -c /tmp/c.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  --data-urlencode "email=dev@pinball.local" \
  --data-urlencode "password=dev-password-123" \
  --data-urlencode "csrfToken=$(cat /tmp/csrf)" -o /dev/null

# 推荐接口（样本 < 20 应返回 mode=prior 降级）
curl -s -b /tmp/c.txt -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"machineId":"<uuid>","multiplier":2,"litHoles":[1,2,3,4,5],"totalBet":5}'

# 未认证必须 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" -d '{"machineId":"<uuid>","multiplier":2,"litHoles":[1,2,3,4,5]}'
```

---

## 测试体系说明

```
tests/
├── rls.test.ts          # RLS 租户隔离（连真实 PG，核心安全断言）
├── auth.test.ts         # 认证（Argon2id / OTP / 注册事务）
├── rounds.test.ts       # 录入规则 + 幂等 + 编辑/撤销回滚
├── predict.test.ts      # L1-L4 算法栈（收敛/不锁死/先验/可复现/KL）
├── e2e/
│   └── entry-flow.spec.ts   # Playwright：录入流 + 离线同步
└── helpers/
    └── db.ts            # cleanDatabase / seedTenant
```

**设计原则**：

- **集成测试连真实 PostgreSQL**：RLS、事务、幂等都是数据库层行为，mock 无法覆盖。
- **测试库与开发库分离**：`pinball_test` 独立，`cleanDatabase()` 会 `TRUNCATE` 全部业务表。
- **E2E 账号经 `/api/test/register` 直建**：跳过 OTP 邮件流（OTP 链路由 `tests/auth.test.ts` 覆盖）。
- **算法测试注入已知参数**：合成偏态机台验证收敛，注入 pegBias 验证拟合恢复，避免「测试跟着实现走」。

## 环境变量

完整示例见 [`.env.example`](./.env.example)。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | 应用连接串（Docker 下指向 pgbouncer） |
| `DIRECT_DATABASE_URL` | ✅ | 迁移直连（绕过 pgbouncer，指向 postgres） |
| `AGG_DATABASE_URL` | — | L4 聚合角色连接（BYPASSRLS，仅聚合路径；缺省从 `DATABASE_URL` 替换凭据推导） |
| `REDIS_URL` | ✅ | BullMQ 队列 + 限流 |
| `AUTH_SECRET` | ✅ | JWT 签名密钥，`openssl rand -base64 32` |
| `AUTH_URL` / `NEXTAUTH_URL` | ✅ | 应用外部地址 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | — | OAuth；留空则不启用，降级邮箱 + OTP |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | — | 同上 |
| `EMAIL_MODE` | — | `console`（默认，打日志）/ `smtp` / `resend` |
| `EMAIL_SERVER` / `RESEND_API_KEY` | — | 邮件发送配置 |
| `ENABLE_TEST_ROUTES` | — | `true` 开启 `/api/test/register`；**生产必须 false** |

## 项目结构

```
pinball/
├── app/
│   ├── (app)/                 # 已登录页面
│   │   ├── page.tsx           # 机台列表
│   │   ├── machine/[id]/      # 机台详情
│   │   ├── session/[id]/play/ # 录入向导
│   │   ├── session/[id]/summary/
│   │   ├── stats/             # 复盘统计（RSC + Recharts）
│   │   └── settings/          # 租户/成员/导出/注销
│   ├── (auth)/                # login / register / verify-otp
│   └── api/                   # auth / machines / sessions / rounds / recommend / montecarlo / export / tenants / account
├── components/
│   ├── entry/                 # EntryWizard / RecommendSheet / MonteCarloPanel / EntrySync
│   ├── stats/                 # StatsCharts
│   └── ui/                    # TouchButton / DisclaimerBanner / VirtualList
├── lib/
│   ├── auth/                  # Auth.js 配置、密码、OTP、租户解析
│   ├── db/                    # prisma / tenant(withTenant) / repo / agg-client
│   ├── predict/               # posterior / bandit / pooling / montecarlo / evaluate
│   ├── queue/                 # redis / montecarlo-worker
│   ├── offline/outbox.ts      # 离线队列
│   ├── audit.ts               # 审计
│   ├── rate-limit.ts          # Redis 滑动窗口
│   ├── rules.ts               # 业务规则常量单一来源
│   └── schemas.ts             # zod 校验
├── prisma/
│   ├── schema.prisma          # 16 个模型
│   ├── migrations/            # init + rls_policies
│   ├── sql/01-app-role.sql    # 应用/聚合角色授权
│   └── seed.ts
├── tests/                     # Vitest + Playwright
├── Dockerfile                 # 多阶段构建
└── docker-compose.yml         # app + worker + postgres + pgbouncer + redis
```

## 安全设计

| 措施 | 实现 |
| --- | --- |
| **双层租户隔离** | 应用 `withTenant`（事务内 `set_config('app.current_tenant', ..., true)`）+ 数据库 RLS `FORCE ROW LEVEL SECURITY`（对表属主也生效） |
| **连接角色最小权限** | `pinball_app` 非 superuser、非 `BYPASSRLS`；`pinball_agg`（BYPASSRLS）仅用于 L4 跨租户聚合，不暴露给任何请求路径 |
| **外键归属校验** | `createSession`/`createRound` 校验 `machineId`/`sessionId` 同租户（RLS 的 `USING` 只保护本行，不校验外键指向） |
| **密码** | Argon2id |
| **Session** | JWT strategy + `maxAge` 过期 |
| **登录限流** | Redis 滑动窗口，每邮箱 5 次/分 |
| **录入幂等** | `clientRequestId` 唯一约束 + 事务，重放不双写 |
| **审计** | 登录/导出/删除/编辑/撤销/邀请/成员变更落 `AuditLog` |
| **注销** | 物理删除租户级联数据 + User；旧 JWT 因 RLS 数据不可达而失效 |
| **生产 checklist** | HTTPS 全链路（`AUTH_URL` 用 https）、`ENABLE_TEST_ROUTES=false`、强随机 `AUTH_SECRET` |

## 部署

```bash
# 生产
cp .env.example .env    # 填 AUTH_SECRET / AUTH_URL(https) / 邮件配置
docker compose up -d
docker compose exec app pnpm prisma migrate deploy
```

- `app` 与 `worker` 复用同一 image，`worker` 用 `command: ["pnpm", "worker"]` 覆盖入口。
- pgbouncer 使用 **transaction 模式**，与 `withTenant` 的 `set_config(..., true)`（事务本地）兼容，连接复用不会串租户。
- 健康检查：postgres `pg_isready`、redis `redis-cli ping`，app/worker `depends_on` 等待就绪。

## 常见问题

**Q：集成测试报 `Can't reach database server at 127.0.0.1:5432`？**
A：确认 PG 在跑（`pg_isready`）。macOS Postgres.app 用户见[第一步](#第一步准备数据库)的 `auth_permission_dialog` 说明——后台进程被该库拦截，需换实例或端口。

**Q：`tests/rls.test.ts` 报「连接角色无 BYPASSRLS 属性」失败？**
A：你用了 superuser 连接。RLS 对超级用户完全无效，必须按[方式二](#方式二本地开发环境)建 `NOSUPERUSER NOBYPASSRLS` 的 `pinball_app` 角色。

**Q：E2E 报「邮箱或密码错误」？**
A：确认 `.env` 里 `ENABLE_TEST_ROUTES=true` 且服务已重启（`next start` 只在启动时读 `.env`）。

**Q：`/api/montecarlo` 一直返回 `pending: true`？**
A：worker 未启动。`pnpm worker`（或 compose 的 `worker` 服务）负责 fit + simulate，样本跨 30/50/100 阈值时才入队。

**Q：推荐一直 `degraded: true`？**
A：样本 < 20 局时降级为先验；≥ 20 局但各档命中率接近时 Thompson 置信度 < 0.55，属正常「无显著差异」标注，继续录入会收敛。

## License

[MIT](./LICENSE)
