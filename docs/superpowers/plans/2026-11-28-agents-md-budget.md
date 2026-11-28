# AGENTS.md 体量预算 Implementation Plan

状态：已实现

**Goal:** AGENTS.md 超过 4,550 个非空白字符时 `npm run check` 失败，CI 与 deploy 无法通过。

**Architecture:** 纯函数与命令行在同一脚本内：`countBudgetChars` / `measureDocBudget` 可单测，`main()` 读取 `DOC_BUDGETS` 中的文件并汇总失败；`check:docs` 追加到 `check` 链。

**Tech Stack:** Node 24 原生 TypeScript（`node --experimental-strip-types`）、Vitest。不新增依赖。

## Global Constraints

- 只预算根 AGENTS.md；不改其他文档的预算与 CI workflow。
- 上限数字只存在脚本的 `DOC_BUDGETS`；AGENTS.md 只链接到脚本。
- 压缩只移解释与清单，规则本身留在 AGENTS.md；安全与非强制约束保留失败后果。
- 先写失败测试再实现；完成前运行 `npm run check` 与 `npm run build`。
- 失败信息必须包含当前值、上限、超出量和处理方式。

## Task 1：纯函数与单测

**Files:** `scripts/check-doc-budget.ts`、`tests/docBudget.test.ts`

1. 先写测试（RED）：空白与表格对齐不计、emoji 按 1 计、未超限 `overBy` 为 0、超限给出差值、预算值为正整数。
2. 实现 `countBudgetChars` / `measureDocBudget` 到 GREEN。

## Task 2：CLI 与 check 接入

**Files:** `scripts/check-doc-budget.ts`、`package.json`

1. CLI 读 `DOC_BUDGETS`：文件缺失、超限退出 1；通过时打印当前值与上限。
2. 新增 `check:docs`，追加到 `npm run check`。

## Task 3：压缩 AGENTS.md

**Files:** `AGENTS.md`、`docs/engineering/documentation.md`、`docs/engineering/data-pipeline.md`、`docs/engineering/development.md`、`docs/engineering/eslint.md`、`README.md`

1. 文档治理的归属表、写作规则与维护规则迁到 `docs/engineering/documentation.md`，根文件留 4 行摘要与链接。
2. 底线约束只留「禁止/必须 + 失败后果 + 链接」；生成数据清单迁到 data-pipeline，页面机制与测试细节迁到 development 与所属 spec；已被 lint/脚本强制的规则缩到一句。
3. README 文档表补 documentation.md；eslint.md 的 `npm run check` 注释补文档预算。

## Task 4：规则与验收

**Files:** `AGENTS.md`、`docs/superpowers/specs/2026-11-28-agents-md-budget-design.md`

1. 「维护本文件」保留体量规则（不重复数字），命令注释补「文档预算」。
2. 按压缩后基线 +5% 把 `DOC_BUDGETS` 定为 4,550，更新 spec 的现状、上限与验收。
3. 记录设计取舍与验收。
