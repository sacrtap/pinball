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

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
