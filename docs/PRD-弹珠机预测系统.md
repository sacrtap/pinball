# 「幻想兔」弹珠机预测系统 — 产品设计方案（PRD）

> 版本 v2.0 · 2026-10-28 · v2.0 变更：①数据存储由本地 IndexedDB 升级为**服务端 PostgreSQL**；②新增**用户登录体系与多租户数据隔离**；③预测算法由单一 Dirichlet 后验升级为**四层算法栈**（Dirichlet 后验 / 蒙特卡洛高尔顿板模拟 / Thompson 采样上下文老虎机 / 层次贝叶斯部分池化）。

---

## 1. 产品背景与目标

### 1.1 图像分析（实拍机台解读）

实拍机台为「BUNNY TIME / 幻想兔（POWER-100%）」主题弹珠机（`docs/images/IMG_20261025_161022.jpg`）：

| 区域 | 图像内容 | 对系统设计的启示 |
|---|---|---|
| 上部 LCD 屏 | 三只卡通兔子；屏下沿显示 **2 / 4 / 6 / 8 / 10** 五个倍率灯位 | 倍率池固定 5 档 |
| 屏上数据区 | 「上局/预计获得珠数」「上局/预计获得卡数」「投珠量」「待出珠子/卡片」 | 直接对应数据模型字段 |
| 中部游戏盘 | 钉子板障碍区、中央兔头、两侧灯柱 | 物理弹道为随机源；盘面钉位固定 → 落点存在可统计的机台个性分布 |
| 底部通道区 | **12 个**物理洞口/通道，红色亮灯指示灯 | 亮灯通道 = 中奖洞口 |
| 右侧拉杆 | 弹簧弹射拉杆（力度可控） | 发力档位（大/中/小）是唯一玩家可控变量，预测核心 |

**结论**：机制 = 倍率随机开出 → 可加注 → 拉杆发射 → 钉板随机弹跳 → 落入亮灯通道按「投入×倍率」返还。系统核心价值：基于历史样本估计「发力档位 × 亮灯布局」条件下的落点条件概率，给出最优发力推荐，并随录入持续自我修正。

### 1.2 玩法规则核实（公开资料交叉验证）

1. **官方评鉴文件**（中国台湾经济部电子游戏机评鉴）：5 珠起投；倍率 **2/4/6/8/10** 随机开出；可加注（上限约 100 珠/局）；奖励 = 投入 × 倍率；游戏区 **12 个通道**，亮灯数随倍率递减；**单次奖励 ≥30 珠出积分卡**（每 30 珠 1 张，单局上限 5 张）。
2. **市场实态**（时代周报/网易/星岛）：加注上限常见 99–100 珠；赢珠可存店；积分卡兑礼品不可兑现。
3. **合规提示**：该类设备符合赌博三要素定义。本系统定位为**个人记录与统计分析工具**，UI 显著提示「概率仅为统计估计」，不接入任何资金/积分流转。

### 1.3 v2.0 产品定位变化

由「单机本地工具」升级为**多租户 SaaS 化个人分析平台**：
- 用户注册登录，数据存服务端 PostgreSQL，跨设备同步；
- 多租户隔离：任何用户/团队只能访问自己租户的数据（数据库层强制）；
- 跨用户**匿名化全局先验**：聚合全平台脱敏落点计数，为新机台/新用户冷启动（须隐私政策明示，可关闭）。

### 1.4 产品目标

- 机台旁快速录入（单局 ≤15 秒 / ≤6 次点按）；
- 满 20 局输出**发力档位推荐 + 通道概率 + 期望值**，模型随落点录入在线修正；
- 复盘：明细、分组命中率矩阵、模型校准与回测、**后悔值（regret）曲线**；
- 多端同步、数据不丢、租户级隔离。

---

## 2. 需求规格

### 2.1 规则参数（常量配置化，可按机台覆盖）

| 参数 | 值 | 说明 |
|---|---|---|
| 倍率池 | [2, 4, 6, 8, 10] | 每局随机开出 1 个 |
| 洞口总数 | **12** | 编号 1–12，左→右（可设置右→左） |
| 亮灯通道数 | 2×:5, 4×:4, 6×:3, 8×:2, 10×:1 | `MULTIPLIER_LIT_COUNT` |
| 默认投入 | 5 珠/局 | 可加注 |
| 奖励 | 投入 × 倍率 | 落入亮灯通道时 |
| 积分卡 | 单次奖励 ≥30 珠触发，每 30 珠 1 张，上限 5 张 | 阈值可按机台调整 |
| 样本门槛 | 20 局 | 未满仅记录不输出推荐 |

### 2.2 功能需求

**F0 账户与租户（v2.0 新增）**
- F0.1 注册/登录：邮箱+密码（注册需邮箱 OTP 验证），可选 OAuth。
- F0.2 租户模型：默认「一用户一租户」（个人空间）；支持邀请成员组建**团队租户**（角色 owner/admin/member），团队内共享机台与数据。
- F0.3 数据隔离：任何接口、任何查询不得跨租户返回数据（数据库 RLS 强制）。
- F0.4 会话管理：JWT 会话、设备列表、一键登出全部设备。

**F1 机台管理**
- F1.1 机器号建档（名称、门店、洞口数、编号方向、备注）；机器号租户内唯一。
- F1.2 手动新建空白 Session，自动编号、记录开始时间。

**F2 对局录入（核心）**
- F2.1 默认投入 5 珠。
- F2.2 向导式步进流：①倍率 → ②亮灯通道（12 洞位图，按倍率限定可选数）→ ③加注珠数 → ④发力档位 → ⑤落点通道 → 自动判中（可覆写）→ 提交即开下一局。
- F2.3 中奖自动算奖励与积分卡；顶部常驻 Session 累计投入/中奖/净盈亏。
- F2.4 撤销上一局、编辑历史局（标记 `edited`，事务内同步回滚模型计数）。
- F2.5 **离线容错**：网络中断时录入进入本地队列，恢复后自动同步（服务端权威，`clientRequestId` 幂等防重）。

**F3 预测与推荐（满 20 局解锁，算法详见 §5）**
- F3.1 输入：倍率 + 亮灯通道。输出：推荐发力档位 + 置信度 + 12 通道概率热力条 + 亮灯联合命中概率 + 期望返还。
- F3.2 推荐方式：**Thompson 采样**（探索/利用自适应），同时展示 argmax 档位作对照；两者一致时标「高置信」。
- F3.3 录入实际落点后四层模型同步在线更新。
- F3.4 蒙特卡洛模拟面板（可展开）：以当前拟合盘面参数模拟 N=10,000 次弹道，展示模拟分布 vs 实测分布对比与误差棒。
- F3.5 样本不足时降级为全局先验并明确标注。

**F4 结束与复盘**
- F4.1 Session 小结：局数、投入/中奖/净盈亏、积分卡、命中率、分组命中率。
- F4.2 明细流水（虚拟列表）。
- F4.3 总体统计：机台对比、发力×倍率矩阵、落点分布直方图 + 理论二项/正态叠加、盈亏趋势、**模型校准曲线、推荐回测、regret 曲线、χ² 拟合优度、L1 vs L2 滚动对数似然对比**。

**F5 数据与设置**
- F5.1 导出 JSON/CSV（本租户全量）。
- F5.2 规则配置（卡片阈值、洞口数/方向、加注上限、样本门槛）。
- F5.3 免责声明常驻；理性提醒开关。
- F5.4 账号注销 = 租户及全部数据物理删除。

### 2.3 非功能需求

- 移动端优先（360–430px，按钮 ≥48px，拇指区布局，振动反馈）。
- 录入接口 p95 < 300ms；统计页 1000 局渲染 < 500ms；蒙特卡洛模拟为服务端异步任务，不阻塞录入。
- 安全：全链路 HTTPS；密码 Argon2id 哈希；RLS 强制隔离；登录/录入接口速率限制；审计日志（登录、导出、删除）。
- 合规：隐私政策、数据导出/删除权、未成年人提示。

---

## 3. 信息架构与页面流

```
登录/注册（未认证唯一入口）
└─ 首页（机台列表）
   └─ 机台详情（Session 列表 + 机台统计）
       ├─ 新建 Session → 对局录入流（循环 6 步）
       │     ├─ 满20局：步2后弹推荐抽屉（含蒙特卡洛模拟面板入口）
       │     └─ 结束 Session → 小结
       └─ Session 详情（明细 + 小结）
统计页（机台对比 / 档位×倍率矩阵 / 落点分布+理论叠加 / 校准 / 回测 / regret）
设置页（账户、团队、规则、导出、注销、免责）
```

交互要点：单选步 auto-advance；洞位图 12 圆钮按物理布局（一行或两行）；亮灯态与落点态视觉区分；推荐抽屉不阻塞流程。

---

## 4. 数据模型（PostgreSQL + TypeScript）

### 4.1 多租户骨架（v2.0 新增）

```sql
CREATE TABLE tenants(id uuid primary key default gen_random_uuid(),
                     name text, created_at timestamptz default now());
CREATE TABLE users(id uuid primary key default gen_random_uuid(),
                   email citext unique not null, password_hash text not null,
                   created_at timestamptz default now());
CREATE TABLE memberships(tenant_id uuid references tenants(id) on delete cascade,
                         user_id uuid references users(id) on delete cascade,
                         role text not null check (role in ('owner','admin','member')),
                         primary key (tenant_id, user_id));
```

**每张业务表均带 `tenant_id uuid not null`**，并启用行级安全（RLS）：

```sql
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON machines
  USING (tenant_id = current_setting('app.current_tenant')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
-- sessions / rounds / posteriors / bandit_arms / sim_params 同样处理
```

应用层在**每个事务开始**执行 `SELECT set_config('app.current_tenant', $1, true)`（`true` = 事务本地，防连接池串租户）；应用连接角色为普通角色（不得 BYPASSRLS）。

### 4.2 业务表

```ts
type Multiplier = 2 | 4 | 6 | 8 | 10;
type PowerLevel = 'low' | 'mid' | 'high';

interface Machine {
  id: string; tenantId: string;
  code: string;                 // 机器号，租户内唯一
  name?: string; venue?: string;
  holeCount: number;            // 默认 12
  holeNumbering: 'ltr' | 'rtl';
  createdAt: Date;
}

interface Session {
  id: string; tenantId: string; machineId: string;
  startedAt: Date; endedAt?: Date;
  status: 'active' | 'closed';
  roundCount: number; totalBet: number; totalWin: number; cards: number; // 冗余统计
}

interface Round {
  id: string; tenantId: string; sessionId: string; seq: number;
  multiplier: Multiplier;
  litHoles: number[];           // PG int[]；校验 length === LIT_COUNT[multiplier]
  baseBet: number;              // 默认 5
  extraBet: number;
  totalBet: number;
  power: PowerLevel;
  landHole: number;             // 1..holeCount
  hit: boolean;
  reward: number;
  cardIssued: number;
  recommendedPower?: PowerLevel;   // 当时推荐（回测用）
  recommendMode?: 'thompson' | 'argmax' | 'prior';
  modelVersion: number;
  edited?: boolean;
  clientRequestId: string;         // 幂等键：离线队列重放防重复
  createdAt: Date;
}

// —— 算法层状态（tenant × machine 维度）——
interface Posterior {            // L1 Dirichlet 后验
  machineId: string; power: PowerLevel;
  counts: number[];              // length = 12
}
interface SimParams {            // L2 蒙特卡洛盘面参数
  machineId: string; power: PowerLevel;
  pegBias: number;               // 单钉右偏概率 p
  entryOffset: number;           // 发力 → 入口位置偏移
  spread: number;                // 展宽系数
  fittedAt: Date; sampleN: number;
}
interface BanditArm {            // L3 Thompson 臂状态
  machineId: string; power: PowerLevel;
  alpha: number; beta: number;   // Beta 后验（命中/未命中计数）
}
```

索引：`rounds(tenant_id, session_id)`、`rounds(tenant_id, machine_id, created_at)`；所有业务表建 `tenant_id` 索引（RLS 过滤性能必需）。

---

## 5. 预测算法设计（v2.0 四层算法栈）

> 调研结论：「发力档位推荐」本质是**上下文老虎机（contextual bandit）**问题——手臂 = 三档发力，上下文 =（倍率，亮灯集合，机台），奖励 = 命中。故推荐层由 v1.0 的 argmax 升级为 Thompson 采样；蒙特卡洛承担「物理先验 + 不确定性量化 + What-if」三重角色；层次贝叶斯解决冷启动。

### L1 基础层：Dirichlet–多项式后验（保留并作为通道分布底座）

每个（机台 × 发力档位）维护 12 维 Dirichlet 后验：α_p = α⁽⁰⁾_p + n_p；落点 h 则 α_{p,h} += 1（在线更新；编辑/撤销同事务反向回滚）。点估计 P̂(h|p) 为后验均值；命中概率 P(中|p,L) = Σ_{h∈L} P̂(h|p)。

### L2 物理层：蒙特卡洛高尔顿板模拟（新增）

**动机**：L1 是纯表格统计，不利用物理结构。钉板弹道近似**有偏高尔顿板**：每颗钉是一次 Bernoulli(p) 左右弹跳，落点服从二项分布 Binomial(n, p)，中心 np、展宽 √(np(1−p))；发力档位改变入口位置与初速，等效于平移中心并改变展宽。利用该结构可用小样本更快收敛、给出理论分布叠加、做 What-if 推演。

**方法**：
1. **参数化盘面模型**：每档位 θ_p = (pegBias, entryOffset, spread)，存 `sim_params`。
2. **拟合**：样本 ≥30 时对实测落点做最大似然——网格搜索 θ 使模拟分布与实测的 KL 散度最小；不足则用全局均值参数。
3. **模拟**：以拟合参数跑 N=10,000 次蒙特卡洛弹道，得各通道概率经验分布，附蒙特卡洛误差棒（σ ≤ √(p̂(1−p̂)/N) ≈ 0.5%）。随机数用可复现种子（seed = machineId + fitVersion），保证可复现。
4. **用途**：(a) 作为 L1 先验 α⁽⁰⁾ 的来源（比均匀先验更接近物理真值）；(b) UI 叠加「理论 vs 实测」分布做失拟检验；(c) What-if：任意亮灯集合 L 直接由模拟读出命中概率，无需等历史覆盖该组合。
5. **局限声明**：真实钉板有钉间相关、多入口、母球碰撞等效应，二项模型是近似；χ² 失拟显著（p<0.01）时 UI 提示「该机台偏离理想盘面，以实测统计（L1）为准」。

### L3 决策层：Thompson 采样上下文老虎机（推荐核心，替代 argmax）

**形式化**：手臂 a ∈ {小,中,大}；上下文 c = (倍率 m, 亮灯集 L)；奖励 r = 命中（1/0）。目标最小化累计后悔值，而非「猜对一次」。

**算法**：
1. 每臂维护 Beta 后验：命中 α+=1，未中 β+=1（初始 α=β=1；有 L2 先验时按等效样本初始化）。
2. 给定亮灯集 L：每臂命中概率 θ_a = Σ_{h∈L} P(h|a)，其后验由 L1 的 Dirichlet 诱导为 Beta(Σ_{h∈L} α_{a,h},\ Σ_{h∉L} α_{a,h})。对每臂**采样** θ̃_a。
3. 推荐 â = argmax_a θ̃_a —— 采样天然平衡探索/利用：不确定档位有机会被选中，证据积累后收敛到最优档（理论后悔 O(log T)，渐近最优）。
4. **置信度**：重复采样 K=2000 次，估计 P(a = argmax) 作为各臂「最优概率」；P(â 最优) < 55% 时标「低置信/各档无显著差异」。
5. **双轨展示**：同屏显示 argmax（纯利用）与 Thompson（探索）结果，不一致时建议按 Thompson 执行以加速学习。

**为什么优于 argmax**：argmax 在小样本下会锁死早期幸运档位（exploitation trap）；Thompson 以概率匹配自动保持探索，样本效率远优于固定 A/B。

### L4 冷启动层：层次贝叶斯部分池化（新增）

新机台/新档位无样本时，先验来自**部分池化**：

$$\boldsymbol{\alpha}^{(0)}_{p,\text{机台}} = S \cdot \bar{P}_{p,\text{全局}},\qquad \bar{P}_{p,\text{全局}} = \text{全平台（脱敏计数）同档位落点分布}$$

先验强度 S 默认等效 15 局；随机台实测样本 n 增长，后验自然由「全局形态」滑动到「机台个性」（权重 ∝ n/(n+S)），无需手工切换。全局聚合只在服务端对匿名计数进行，不含任何用户标识；用户可在设置中关闭「贡献匿名统计」。

### 5.5 模型自检与评估（统计页）

- **校准曲线**：预测命中概率分桶 vs 实际命中率；
- **回测**：历史局重放「采纳推荐 vs 实际选择」期望净盈亏差；
- **Regret 曲线**：Thompson 累计后悔随局数曲线（理想趋平）；
- **χ² 失拟检验**：实测落点 vs L2 模拟分布、vs 均匀分布；
- **L1 vs L2 滚动对数似然对比**：哪个模型更能预测下一局落点（one-step-ahead）。

### 5.6 实现要点

- 算法全栈 TypeScript：L1/L3/L4 为计数器运算（O(12)/次）；L2 蒙特卡洛 1e4 弹道 × 12 钉 ≈ 12 万次随机数，服务端 <50ms，**异步任务执行并缓存**，前端只读结果。
- 模型状态落库（`posteriors / bandit_arms / sim_params`），更新与 round 写入**同事务**；`modelVersion` 单调递增便于回溯。

---

## 6. 合规与伦理声明

- 纯个人统计分析工具：不接机台硬件、无资金往来、不承诺中奖；
- 常驻提示：「结果本质随机，历史统计不构成未来保证」；未成年人监护提示；
- 跨用户聚合仅匿名计数、隐私政策明示、可关闭；账号注销物理删除全部租户数据。
