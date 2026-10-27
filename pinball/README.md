# 幻想兔 · 弹珠机预测系统

多租户 SaaS 化弹珠机个人统计分析工具：注册登录 → 机台建档 → 向导式快速录入对局 → 满 20 局后基于四层算法栈（L1 Dirichlet 后验 / L2 蒙特卡洛高尔顿板 / L3 Thompson 采样上下文老虎机 / L4 层次贝叶斯部分池化）给出发力档位推荐与通道概率 → 复盘统计（命中率矩阵、校准、回测、regret、χ²、L1 vs L2 滚动对数似然）。

## 技术栈

Next.js 15（App Router）· TypeScript · Prisma 6 · PostgreSQL（RLS）· Auth.js v5 · Tailwind · Zustand · zod · Recharts · Vitest · Playwright · BullMQ · Docker

## 快速开始（Docker 一键）

```bash
cp .env.example .env
# 必填：AUTH_SECRET（openssl rand -base64 32）
docker compose up -d
docker compose exec app pnpm prisma migrate deploy
docker compose exec app pnpm prisma db seed
```

- app：http://localhost:3000（Next + API）
- worker：`pnpm worker`（BullMQ 蒙特卡洛重拟合）
- pgbouncer：transaction 模式（兼容 RLS 的 `set_config(..., true)`）

## 本地开发（无 Docker）

前置：PostgreSQL 16+、Redis 7。

```bash
pnpm install
cp .env.example .env        # DATABASE_URL 指向本机 PG

# 建库 + 应用连接角色（非 superuser、非 BYPASSRLS —— RLS 的硬性要求）
psql -U postgres -d pinball_dev -c "CREATE DATABASE pinball_test OWNER pinball_app;"
psql -U postgres -d pinball_dev -f prisma/sql/01-app-role.sql
psql -U postgres -d pinball_test -f prisma/sql/01-app-role.sql

pnpm prisma migrate deploy
pnpm prisma db seed        # dev@pinball.local / dev-password-123

pnpm dev                   # http://localhost:3000
```

> **RLS 角色要求**：连接角色必须既不是 superuser 也不带 `BYPASSRLS`，否则 `FORCE ROW LEVEL SECURITY` 形同虚设。`prisma/sql/01-app-role.sql` 同时创建 `pinball_agg`（BYPASSRLS）专供 L4 跨租户聚合 job 使用。
>
> **Postgres.app 注意**：其 `auth_permission_dialog` 共享库会阻塞后台服务进程的 TCP 连接（前台终端不受影响）。本地跑 `next start` 请用无该库的 PG 实例（如独立端口）或 unix socket。

## 测试

```bash
pnpm lint && pnpm typecheck
pnpm test                       # Vitest：RLS/认证/规则/录入幂等/算法栈
pnpm playwright test            # E2E（需先 pnpm build && pnpm start）
```

测试库 `pinball_test` 需先执行迁移：`DATABASE_URL=...pinball_test... pnpm prisma migrate deploy`。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 应用连接（pgbouncer） |
| `DIRECT_DATABASE_URL` | 迁移直连（绕过 pgbouncer） |
| `AGG_DATABASE_URL` | L4 聚合角色连接（BYPASSRLS，仅 worker/聚合路径） |
| `REDIS_URL` | BullMQ + 限流 |
| `AUTH_SECRET` | JWT 签名密钥（`openssl rand -base64 32`） |
| `AUTH_GOOGLE_ID/SECRET`、`AUTH_GITHUB_ID/SECRET` | OAuth（留空则不启用，降级邮箱+OTP） |
| `EMAIL_MODE` / `EMAIL_SERVER` / `RESEND_API_KEY` | 邮件（`console` 打印到日志） |
| `ENABLE_TEST_ROUTES` | E2E 测试路由开关（生产务必 false） |

## 安全 checklist

- [x] 租户隔离双层：应用 `withTenant` + 数据库 RLS（FORCE，属主也受约束）
- [x] 连接角色非 superuser / 非 BYPASSRLS（聚合角色单独隔离）
- [x] 密码 Argon2id
- [x] JWT session + 过期（`session.maxAge`）
- [x] 登录限流（Redis 滑动窗口，每邮箱 5 次/分）
- [x] 录入幂等（`clientRequestId` 唯一约束 + 事务）
- [x] 审计日志（登录/导出/删除/编辑/撤销/邀请/成员变更）
- [ ] 生产部署务必开启 HTTPS 全链路（`AUTH_URL` 用 https）

## 目录

```
app/            # App Router：页面 + API 路由
components/     # UI（entry / stats / ui）
lib/
  auth/         # Auth.js 配置、OTP、租户解析
  db/           # Prisma 客户端、withTenant、仓储
  predict/      # L1-L4 算法栈 + evaluate
  queue/        # BullMQ worker + Redis 连接
prisma/
  schema.prisma
  migrations/   # init + rls_policies
  sql/          # 应用/聚合角色授权
tests/          # Vitest 集成测试 + Playwright E2E
```
