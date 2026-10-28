# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

### 必须覆盖「不可用」路径，不能只测主路径

只断言「能正常操作」的测试，测不出「操作被静默拒绝」这类缺陷。

对每个交互组件，除主路径外还必须覆盖：

| 路径 | 断言什么 |
| --- | --- |
| 达到上限/边界 | 后续控件 `isDisabled()` 为 true，且 `aria-label` 含原因说明 |
| 从边界恢复 | 取消一项后，原禁用控件恢复可用（不能测完禁用就结束） |
| 规则参数变化 | 同一组件在不同参数下上限正确（如亮灯上限随倍率 5/4/3/2/1） |
| 视觉/文字反馈 | 页面出现解释文案，而非仅靠颜色传达状态 |

「有时」类 bug 几乎都源于**规则随参数变化**而测试只跑了一组参数。参数化的边界用例要覆盖全部分支。

### 交互测试必须打乱顺序

固定升序点击（1→2→3→…）会掩盖大量缺陷。`HoleBoard` 的「只能点比已选最大值更大的号」就是典型：升序点击永远落在排序后末尾，测试全绿；乱序点击立刻暴露。

最低要求：

| 维度 | 必测形态 |
| --- | --- |
| 点击顺序 | 至少一组**乱序**（如 1, 3, 6, 11, 5）与一组**降序** |
| 规则参数 | 每个参数分支各跑一次（如亮灯上限随倍率 5/4/3/2/1） |
| 取消路径 | 选满后取消一个，确认禁用态正确恢复 |

另外：断言「选中数量 == 上限」比断言「某几个被选中」更强，能同时抓住多选和漏选。

### E2E 与本地构建的环境陷阱（2026-10-28 实测）

| 症状 | 根因 | 处置 |
| --- | --- | --- |
| 页面 500 + 日志 `webpack-runtime.js: TypeError: Cannot read properties of undefined (reading 'call')` | dev server 常驻时并发执行 `next build`，两个进程竞争写 `.next`，产出残缺 chunk | `next.config.ts` 支持 `E2E_BUILD=1` 切独立 `distDir: .next-e2e`；E2E 用 `TEST_BASE_URL` 指向该构建的 `next start`。tsconfig include / eslint ignores / .gitignore 已同步 `.next-e2e` |
| `pnpm install` 报 `ERR_PNPM_INVALID_WORKSPACE_CONFIGURATION packages field missing or empty` | 本目录 `pnpm-workspace.yaml` 只有 `allowBuilds`（pnpm 10 语义），本机默认 pnpm 8 不认 | 一律 `npx -y pnpm@10 install`；README 已要求 pnpm ≥10 |
| argon2 编译失败 `'functional' file not found` | macOS CLT 的 `/usr/include/c++/v1` 被系统更新清空（仅剩 11 项，SDK 内 185 项完好），clang 的 `-internal-isystem` 优先指向残缺目录 | 手动补编：`cd node_modules/.pnpm/argon2@*/node_modules/argon2 && CXX="clang++ -stdlib=libc++ -isystem \$(xcrun --show-sdk-path)/usr/include/c++/v1" /usr/local/bin/node-gyp rebuild`。注意沙箱无外网时 `npx node-gyp` 会 ECONNRESET，用本地 `/usr/local/bin/node-gyp` |
| `pnpm install` 每次因 argon2 install 脚本失败整体回滚（node_modules 被清空） | 同上；install 脚本不带 CXX 注入 | 先 `pnpm install --ignore-scripts` 装齐依赖，再手动补编 argon2 + `npx prisma generate` |

**规则**：改动 `pnpm-lock.yaml` 必须用 pnpm 10（pnpm 8 会把 lockfileVersion 降级并漂移依赖版本，产生 6000+ 行无关 diff）。

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
