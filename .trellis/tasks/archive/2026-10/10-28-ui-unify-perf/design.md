# Design：统一前端组件规范与页面响应优化

## 1. 总体策略

不引入外部 UI 框架（PRD 约束）。以**项目内统一基元层**达成规范：在 `components/ui/` 建立语义化基元组件，全部页面/组件消费基元，消灭手写 class 分裂。性能优化限于「小步可证」：O(n²)→O(n)、loading 反馈、防重禁用。

核心判断依据（来自调研实测）：

- 已有 `components/ui/TouchButton.tsx` 就是统一按钮（`min-h-12 rounded-xl` + primary/secondary/ghost/danger 变体），但**只有极少数处使用**；设置页、数字键盘、入口选择全是手写 class。
- 因此不是「缺框架」，而是「有基元但未收敛」。策略 = **补全基元 + 全量迁移**，而不是新造体系。

## 2. 组件设计

### 2.1 基元清单（`components/ui/`）

| 组件 | 文件 | 覆盖现状分裂 |
|---|---|---|
| `TouchButton` | 现有，**增强**（+`size` +`loading`） | 按钮 4+ 套并存（TouchButton / 设置页小按钮 / 入口大选择 / 数字键盘） |
| `Input` | `components/ui/Input.tsx`（新建） | 输入框 2 套（大输入 vs 设置页小输入） |
| `Card` | `components/ui/Card.tsx`（新建） | 卡片 bg 时有时无、rounded-xl/2xl 分裂 |
| 样式常量 | `components/ui/styles.ts`（新建） | 入口选择控件/数字键盘/链接按钮共享基类 |

> **设计修正（2026-10-28，实现前核对）**：`grep -rn TouchButton` 实测有 **6 个文件**消费者
> （login/register/EntryWizard/MachineList/MachineForm/NewSessionButton），调研报告「极少使用」
> 的判断有误。因此**不删除 TouchButton、不新建 Button**——增强现有组件（加 `size: 'md'|'sm'`
> 与 `loading`），6 个现有消费者零改动即受益，设置页小按钮迁到 `size="sm"`。遵循 ponytail
> 最小化原则：能扩展就不新建。

### 2.2 TouchButton 增强（而非新建 Button）

```tsx
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;   // 默认 'secondary'
  size?: ButtonSize;         // 默认 'md'（min-h-12）；'sm' 用于表格/行内次要操作（min-h-9）
  block?: boolean;           // w-full
  loading?: boolean;         // 进行中：禁用 + 文案/图标反馈
}
```

样式基类（Tailwind v4 + CSS 变量）：

- 基座：`inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition-transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none`
- `md`：`min-h-12 px-4 py-3 text-base`；`sm`：`min-h-9 px-3 py-1.5 text-sm`
- 变体：
  - `primary`：`bg-[var(--accent)] text-white border-transparent`（注意：设置页现有 primary 手写为 `text-[var(--surface)]`，统一为白色前景需核对 accent 对比度；以 `--accent` 变量定义为准，若 accent 为浅色则改用 `text-[var(--surface)]`——**实现时先读 globals.css 确认**）
  - `secondary`：`border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]`
  - `ghost`：`border-transparent bg-transparent text-[var(--fg)]`
  - `danger`：`border-[var(--error)] bg-transparent text-[var(--error)]`
- `loading`：自动 `disabled` + 子节点前加 `lucide-react` 的 `Loader2` 旋转图标，`aria-busy`。

**入口大选择按钮**（PowerPicker/MultiplierPicker 的 `min-h-20 rounded-2xl text-lg font-bold`、HoleBoard 圆形、ExtraBetStepper 数字键）**不强行并入 Button**：它们是领域选择控件（自含选中态、布局、无障碍语义），并入会让 Button 膨胀成万能组件。处理方式：

- 抽取**共享样式常量** `components/ui/styles.ts`（`SELECTABLE_BASE`、`INPUT_BASE`、`CARD_BASE` 等导出的 class 字符串），领域控件引用同一常量 → 圆角/边框/按压反馈仍统一，但保留各自布局。
- `HoleBoard` 圆形按钮（`rounded-full`）保留形状，仅统一边框/按压/禁用态基类。

### 2.3 Input 设计

```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;   // 错误态边框（现有登录错误提示是文字，不强制改行为）
}
```

- 基类：`min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--fg)] placeholder:text-[var(--muted)]`
- `invalid`：`border-[var(--error)]`
- 设置页的邀请邮箱 input 从「小输入」迁到 `Input`（size 固定 md，设置页行内布局用 `flex-1` 包裹控制宽度，不再用 class 缩小控件本身）。

### 2.4 Card 设计

```tsx
function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>)
```

- 基类：`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3`
- 现状分裂（MachineList 项有 bg、设置页租户行/统计 KPI 无 bg、RecommendCard `rounded-2xl`）全部收敛到此基类；需要强调的卡片用 `className` 追加 `border-[var(--accent)]/50` 等，不改基类。

### 2.5 设置页退出登录（R1）

- 位置：设置页「危险操作」区块**上方**新增独立区块「账号」或放在「数据导出」后——**与注销账号保持距离**，避免误触。定稿：新增「会话」区块（或并入「我的租户」区块底部），按钮 `variant="ghost"` + `LogOut` 图标，文案「退出登录」。
- 交互：`await signOut({ redirect: false })` → `window.location.href = '/login'`，与现有注销收尾同款（`settings/page.tsx:112-115`）。按钮点击后置 loading 禁用，防重复点击。
- 复用：抽出 `handleSignOut` 内部函数，注销流程收尾也调用它（消除第二处 `signOut` 字面量，符合 code-reuse 指南）。

### 2.6 性能优化（R3）

#### a. 统计页 O(n²) → O(n)（`app/(app)/stats/page.tsx:48-54`）

`pnlTrend` 抽为 `lib/predict/evaluate.ts` 纯函数（可对拍）：

```tsx
export function pnlTrend(rounds: RoundLike[]) {
  let acc = 0;
  return rounds.map((r, i) => {
    acc = acc + r.reward - r.totalBet;   // 不是 acc += r.reward - r.totalBet
    return { round: i + 1, pnl: acc };
  });
}
```

> **浮点陷阱（实现时被对拍测试抓到）**：旧实现
> `slice(0, i+1).reduce((s, x) => s + x.reward - x.totalBet, 0)` 每步是
> `(s + reward) - bet`；直觉写法 `acc += reward - bet` 每步变成
> `acc + (reward - bet)`——**两者在 IEEE754 下不等**（实测某点
> `96.19` vs `96.19000000000001`）。`tests/evaluate-pnl.test.ts` 用
> 1000 局混合数据 + 0.1 累加敏感用例对拍，防回归。

#### b. loading 反馈

`app/(app)/stats/loading.tsx`：骨架屏（`rounded-xl border animate-pulse` 块 × N + KPI 占位）。合规：免责声明 `DisclaimerBanner` 在服务端 `page.tsx` 渲染，loading 骨架仅替代数据区；提示不丢失。

仅统计页补 loading（PRD 性能主诉点）；其余页面数据量小，不补（YAGNI）。

#### c. 删除机台防重（`components/machine/MachineList.tsx`）

```tsx
const [deletingId, setDeletingId] = useState<string | null>(null);
async function doDelete(id: string) {
  if (deletingId) return;               // 已在删除中，忽略重复触发
  setDeletingId(id);
  try {
    const res = await fetch(`/api/machines/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('删除失败');
    setMachines((prev) => prev.filter((m) => m.id !== id));
    setConfirmingId(null);
    router.refresh();
  } catch { /* 保持确认态，允许重试；错误提示沿用现状风格 */ }
  finally { setDeletingId(null); }
}
```

参照 MachineForm 既有 `loading + disabled` 模式；删除中该行按钮禁用。

#### d. 其余交互审计结论（设计留档）

| 交互 | 现状 | 处置 |
|---|---|---|
| 新建机台 | loading+disabled ✓ | 迁到 Button loading |
| 新建对局 | loading+disabled ✓ | 迁到 Button loading |
| 录入提交 | 服务端 clientRequestId 幂等 ✓ | 不动逻辑，仅样式 |
| EntrySync flush | `r.sent > 0` 才 refresh ✓ | 不动 |
| 推荐预取 | `if (store.recommendation) return` 守卫 ✓ | 不动 |
| 设置页 effect | 依赖稳定，dev StrictMode 双跑属正常 | 不动 |

#### e. 统计页查询瘦身

现状 select 已精确（power/亮灯/createdAt 等图表字段）。核对 `stats/page.tsx:14-26` select 列表与 StatsCharts props 消费字段，**删掉未被消费的字段**（如有）。不加索引/缓存（数据量为个人工具量级，先测）。

### 2.7 死代码处置

`components/ui/VirtualList.tsx`、`components/entry/MonteCarloPanel.tsx` 全项目无导入。随本轮**删除**（PRD A8：删除优于保留无引用代码；`@tanstack/react-virtual` 依赖若仅它使用，一并从 package.json 移除——实现时 grep 确认无其他引用）。

## 3. 变更文件清单

| 文件 | 变更 |
|---|---|
| `components/ui/TouchButton.tsx` | **增强**（+size +loading，不删除） |
| `components/ui/Input.tsx` | 新建 |
| `components/ui/Card.tsx` | 新建 |
| `components/ui/styles.ts` | 新建（共享 class 常量：SELECTABLE_BASE 等） |
| `components/ui/VirtualList.tsx` | 删除（死代码） |
| `components/entry/MonteCarloPanel.tsx` | 删除（死代码） |
| `package.json` | 如 `@tanstack/react-virtual` 仅 VirtualList 使用则移除 |
| `app/(app)/settings/page.tsx` | 退出登录 + 全量样式迁移 |
| `components/machine/MachineForm.tsx` | 样式迁移 |
| `components/machine/MachineList.tsx` | 样式迁移 + 删除防重 |
| `components/session/NewSessionButton.tsx` | 样式迁移 |
| `components/entry/PowerPicker.tsx` | 样式常量迁移 |
| `components/entry/MultiplierPicker.tsx` | 同上 |
| `components/entry/ExtraBetStepper.tsx` | 同上 |
| `components/entry/HoleBoard.tsx` | 同上（保留圆形） |
| `app/(auth)/login/page.tsx`、`register/page.tsx` | Input 迁移 |
| `app/(app)/stats/page.tsx` | O(n) 前缀和 + select 核对 |
| `app/(app)/stats/loading.tsx` | 新建 |
| `tests/e2e/*.spec.ts` | 新增/扩展：退出登录、统计 loading、删除防重 |
| `tests/` 单测 | pnlTrend 对拍（可放入既有 stats 相关测试文件或新建） |

**不改**：API 路由、Prisma schema、RLS、`lib/`、`EntryWizard.tsx` 逻辑、`RecommendCard`/`DisclaimerBanner`/`BottomNav`（已是统一样式，除非 grep 发现遗漏）。

## 4. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 样式迁移引入视觉回归（尤其 E2E 依赖的 class/选择器） | E2E 选择器若用 class 需同步；优先保持 DOM 结构与 data 属性不变，只换 class 值 |
| `--accent` 对比度导致 primary 前景色变化 | 实现前读 `globals.css` 确认 accent 实际色值再定 `text-white` vs `text-[var(--surface)]` |
| pnlTrend 浮点对拍失败 | 若左结合顺序确实一致则 bit 级相等；对拍用 `toBe`（严格相等），失败则说明假设错，改用 `toBeCloseTo` 并记录原因 |
| 删除 VirtualList 后 TS 报未用依赖 | `pnpm typecheck` 兜底；依赖移除后重装锁文件 |
| TouchButton 有其他隐式消费者 | 删除前 `grep -r TouchButton` 全量确认（调研称极少使用，需复核） |

回滚点：基元组件先行、页面逐个迁移，每步可独立回退；删除死代码与 TouchButton 放在迁移完成后单次提交。

## 5. 验证计划

1. `pnpm lint && pnpm typecheck`
2. `pnpm test`（Vitest 真实 PG 串行，含 pnlTrend 对拍新用例）
3. `pnpm playwright test tests/e2e/entry-flow.spec.ts`（防回归）
4. 新 E2E：退出登录流 / 统计 loading / 删除防重请求计数
5. 手动 smoke：dev 服务器逐页走查按钮/输入/卡片视觉一致性
