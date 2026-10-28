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

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
