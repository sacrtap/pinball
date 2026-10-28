# 「幻想兔」弹珠机预测系统 — 技术执行方案

> 版本 v2.0 · 2026-10-28 · 配套文档：`PRD-弹珠机预测系统.md`（同目录）
> v2.0 变更：架构由「纯前端静态应用」升级为「Next.js 全栈 + PostgreSQL 多租户」；算法由单层 Dirichlet 升级为四层算法栈（Dirichlet / 蒙特卡洛模拟 / Thompson 采样 / 层次贝叶斯）。

---

## 1. 技术选型与理由

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Next.js 15 (App Router) + TypeScript，全栈模式** | v2.0 需要服务端：API Routes + Server Actions 承载录入与算法，RSC 直出统计页 |
| 数据库 | **PostgreSQL 16** | 用户指定；RLS 行级安全是租户隔离的最强保障；int[]/jsonb 原生支持亮灯集合与计数器 |
| ORM | **Prisma**（+ 手写 SQL 迁移管理 RLS） | 类型安全、迁移规范；RLS 策略通过 migration SQL 版本化 |
| 认证 | **Auth.js v5（NextAuth）** | 与 Next.js 深度集成；Credentials（邮箱+Argon2id）+ OAuth 可插拔；JWT 携带 tenantId |
| 租户隔离 | **共享 schema + tenant_id + RLS 双层防护** | 见 §3；比 schema-per-tenant 易迁移，比 DB-per-tenant 省成本，隔离强度足够 |
| 连接池 | **PgBouncer（transaction 模式）** 或 serverless driver | RLS 的 `set_config(..., true)` 事务本地设置与 transaction pooling 兼容 |
| 前端状态 | **Zustand** + 服务端组件数据流 | 录入流向导状态轻量 |
| UI | **Tailwind CSS + 自绘大触控控件** | 洞位图/倍率钮/步进器均为定制控件 |
| 校验 | **zod** | 前后端共用 schema；亮灯数=倍率映射等规则校验 |
| 图表 | **Recharts** | 直方图/校准曲线/regret 曲线/热力矩阵 |
| 离线容错 | 本地 outbox 队列（localStorage）+ `clientRequestId` 幂等 | 电玩城弱网环境必需 |
| 算法 | **纯 TS 模块 `lib/predict/`**，蒙特卡洛在**服务端异步任务**执行 | 见 §4 |
| 测试 | **Vitest**（算法/规则/RLS 集成） + **Playwright**（E2E mobile viewport） | 算法与隔离必须 100% 覆盖 |
| 部署 | 全栈托管（Vercel/Railway/自建 Docker）+ 托管 PG | 一份 Dockerfile 可自托管 |

**从 v1.0 移除**：静态导出、Dexie/IndexedDB 作为主存储（降级为可选离线草稿缓存）。

## 2. 工程结构

```
pinball/
├─ app/
│  ├─ (auth)/login/page.tsx, register/page.tsx
│  ├─ (app)/
│  │  ├─ page.tsx                    # 机台列表（RSC）
│  │  ├─ machine/[id]/page.tsx
│  │  ├─ session/[id]/play/page.tsx  # 录入流（客户端组件）
│  │  ├─ session/[id]/summary/page.tsx
│  │  ├─ stats/page.tsx
│  │  └─ settings/page.tsx
│  └─ api/
│     ├─ auth/[...nextauth]/route.ts
│     ├─ rounds/route.ts             # POST 提交一局（事务：round+统计+模型）
│     ├─ rounds/[id]/route.ts        # PATCH 编辑/撤销（回滚事务）
│     ├─ recommend/route.ts          # POST 获取推荐
│     └─ stats/route.ts
├─ components/
│  ├─ entry/   EntryWizard / MultiplierPicker / HoleBoard(12洞) / ExtraBetStepper
│  │           / PowerPicker / RecommendSheet / MonteCarloPanel
│  ├─ stats/   …图表组件
│  └─ ui/      大触控基础控件
├─ lib/
│  ├─ db/
│  │  ├─ prisma.ts                   # 单例 client
│  │  ├─ tenant.ts                   # withTenant(tenantId, fn)：事务内 set_config + fn
│  │  └─ repo.ts                     # 租户绑定仓储（不接受裸 tenantId 参数以外查询）
│  ├─ auth/                          # Auth.js 配置、Argon2id、会话→tenant 解析
│  ├─ predict/
│  │  ├─ posterior.ts                # L1 Dirichlet 更新/回滚/估计
│  │  ├─ bandit.ts                   # L3 Thompson 采样、Beta 后验、P(argmax) 置信
│  │  ├─ montecarlo.ts               # L2 盘面参数拟合（KL 网格搜索）+ N 次模拟
│  │  ├─ pooling.ts                  # L4 全局先验聚合（匿名计数）与部分池化
│  │  └─ evaluate.ts                 # 校准/回测/regret/χ²/对数似然
│  ├─ rules.ts                       # MULTIPLIERS、LIT_COUNT、卡片规则
│  └─ types.ts
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/                    # 含 RLS policy SQL
├─ tests/
│  ├─ predict.test.ts                # 四层算法收敛性与幂等
│  ├─ rls.test.ts                    # 跨租户访问必须 0 行（集成测试）
│  └─ e2e/entry-flow.spec.ts
└─ Dockerfile / docker-compose.yml   # app + postgres + pgbouncer
```

## 3. 多租户与认证设计（核心）

### 3.1 认证流

1. 注册：邮箱+密码 → 发 OTP → 验证后建 `users` + 个人 `tenants` + `memberships(owner)`（单事务）。
2. 登录：Auth.js Credentials Provider，密码 Argon2id 校验；会话 JWT claim 携带 `userId` 与当前 `tenantId`（团队用户切换租户时刷新 token）。
3. 中间件只做粗粒度未认证拦截；**对象级授权在数据层**（吸取 CVE-2025-29927 教训：middleware 不可作为唯一防线）。

### 3.2 租户隔离：双层防护

```ts
// lib/db/tenant.ts —— 唯一数据入口
export async function withTenant<T>(tenantId: string, fn: (tx: PrismaTx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return fn(tx);
  });
}
```

- **第一层（应用层）**：所有仓储函数包在 `withTenant` 内，结构上不存在「无租户查询」的代码路径。
- **第二层（数据库层 RLS）**：每张业务表 `ENABLE + FORCE ROW LEVEL SECURITY`，policy 比对 `tenant_id = current_setting('app.current_tenant')::uuid`——即使应用层漏写 WHERE，数据库也拒绝返回他租户行。应用连接使用普通角色（非 BYPASSRLS、非 superuser）。
- 每张业务表建 `tenant_id` 索引；`onDelete: Cascade` 保证注销即物理清数据。
- **测试即功能**：`rls.test.ts` 用两个租户 fixture 断言交叉访问恒返回 0 行/404；E2E 遍历全部路由断言未认证 401。

### 3.3 录入接口幂等与事务

`POST /api/rounds` 单事务内：①幂等检查 `clientRequestId`（命中则返回已有记录）②insert round ③更新 session 冗余统计 ④L1 posterior +1 ⑤L3 bandit 臂更新。编辑/撤销在同一事务内反向回滚后向计数再正向应用新值，并递增 `modelVersion`。

## 4. 算法引擎（lib/predict，服务端执行）

### 4.1 L1 Dirichlet 后验（posterior.ts）

```ts
interface Posterior { machineId: string; power: PowerLevel; counts: number[12]; }
updatePosterior(tx, machineId, power, hole)   // counts[hole-1]++（事务内）
revertPosterior(tx, machineId, power, hole)   // counts[hole-1]--
estimate(p, litHoles?): number                 // Σ_{h∈L} (α_h)/Σα —— 命中概率
```

### 4.2 L3 Thompson 采样（bandit.ts）

```ts
recommend(machineId, litHoles): {
  thompsonPower, argmaxPower, bestArmProb[3], degraded, expectedReturn
}
// 每臂后验由 L1 诱导：Beta(Σ_{h∈L} α_{a,h}, Σ_{h∉L} α_{a,h})
// 采样 K=2000 → bestArmProb；<0.55 → degraded=true（“无显著差异”）
```

### 4.3 L2 蒙特卡洛模拟（montecarlo.ts）

- 盘面模型：12 行钉，单钉右偏 p，发力档位 → (entryOffset, spread)。
- 拟合：样本 ≥30 时网格搜索（p ∈ [0.3,0.7] step 0.01 × offset ∈ [-2,2] × spread ∈ [0.8,1.3]）最小化 KL(实测‖模拟)；结果写 `sim_params`。
- 模拟：N=10,000，可复现种子；输出通道概率 + 蒙特卡洛误差棒；结果缓存（按 fitVersion 失效）。
- 执行方式：录入事务**不等待**；由异步任务（队列或按需 API 触发 + 缓存）计算，前端轮询/下一局自然读到。

### 4.4 L4 部分池化（pooling.ts）

- 后台聚合任务：跨租户汇总**匿名**（machineId 哈希化、无 userId）(power, hole) 计数 → 全局先验分布 P̄_p。
- 用户关闭「贡献匿名统计」的租户不计入聚合（membership/settings 标记，聚合查询显式排除）。
- 新机台 posterior 初始化：α⁽⁰⁾ = 15 × P̄_p。

### 4.5 评估（evaluate.ts）

校准分桶、推荐回测（用 `rounds.recommendedPower`）、regret 累计曲线、χ²（实测 vs 模拟 / vs 均匀）、L1 vs L2 滚动对数似然。

## 5. 测试策略

| 层 | 内容 |
|---|---|
| 算法单测（Vitest） | 规则校验（亮灯数=倍率映射、奖励=投入×倍率、卡片 floor 上限 5）；posterior/bandit 更新回滚幂等；合成偏态机台 100 局收敛到真最优档；Thompson 在双档接近时不锁死（探索率 >0）；蒙特卡洛可复现性（同 seed 同结果）、拟合能恢复注入的 pegBias |
| 安全集成测试 | RLS：双租户交叉访问恒 0 行；未认证路由遍历 401；幂等键重复提交不双写 |
| E2E（Playwright mobile） | 注册→建机台→录 3 局→统计正确；20 局解锁推荐；断网→本地队列→恢复自动同步不重复；编辑历史局后统计与模型一致 |
| 验收检查项 | ①离线恢复无重复无丢失 ②1000 局统计页 <500ms ③单局录入 ≤6 次点按 ④录入 p95 <300ms ⑤RLS 测试全绿 |

## 6. 开发阶段与里程碑

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| **M1 基座：认证+租户+数据层**（约 3–4 天） | PG+Prisma+迁移（含 RLS）、Auth.js 注册登录、withTenant、机台/Session CRUD | RLS 集成测试全绿；双租户隔离验证 |
| **M2 录入流**（约 3–4 天） | EntryWizard 6 步、自动判中、奖励/卡片、连续录入、撤销/编辑（事务回滚）、离线队列+幂等 | E2E 录入流、断网恢复、幂等测试通过 |
| **M3 算法栈 L1+L3+L4**（约 3–4 天） | posterior/bandit/pooling 模块 + 单测；推荐接口与 RecommendSheet；满 20 局解锁 | 合成数据收敛测试通过；双轨推荐 UI |
| **M4 算法栈 L2 + 统计页**（约 3–4 天） | 蒙特卡洛拟合与模拟（异步+缓存）、MonteCarloPanel；统计页全套（矩阵/分布+理论叠加/校准/回测/regret/χ²/对数似然） | 蒙特卡洛可复现；验收②通过 |
| **M5 打磨发布**（约 2–3 天） | 团队租户邀请、导出、注销清数据、理性提醒、审计日志、性能压测、Docker 部署 | 真机走查；安全 checklist 全过 |

**总计约 14–19 个工作日**（较 v1.0 +4 天，主要增量在认证/RLS 与 L2/L3 算法）。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 跨租户数据泄露 | RLS FORCE + 应用层 withTenant 双层；RLS 测试进 CI；连接角色禁 BYPASSRLS |
| 连接池串租户 | `set_config(..., true)` 事务本地；PgBouncer 用 transaction 模式；禁用带租户态的 prepared statement 跨事务复用 |
| 蒙特卡洛误导（模型失拟） | χ² 失拟显著时 UI 降级声明「以实测为准」；L1/L2 对数似然对比长期监控 |
| Thompson 探索导致短期「故意推荐差档」 | 低置信时明示「正在探索」；提供 argmax 对照；探索幅度由后验宽度自动控制 |
| 全局先验隐私 | 仅匿名计数聚合、可关闭；隐私政策明示 |
| 模型被当作「稳赢工具」 | 置信度/期望值对照基准；免责声明；理性提醒 |
