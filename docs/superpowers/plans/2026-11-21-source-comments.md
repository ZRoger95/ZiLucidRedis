# 源码注释约束实施计划

状态：已实现

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理 `src/` 手写源码中的普通注释，并通过文档与 lint 阻止后续新增。

**Architecture:** 在 ESLint 配置中注册本地 TS/TSX 注释规则；对 CSS 使用无依赖的小型检查脚本，并将它接入 `npm run lint`。移除现有普通注释，保留必须的工具指令和生成数据注释。

**Tech Stack:** TypeScript、ESLint 10 flat config、Node 原生脚本、Vitest。

**Spec:** `docs/superpowers/specs/2026-11-21-source-comments-design.md`

## Global Constraints

- 仅处理 `src/` 手写 TS、TSX、CSS；不处理生成数据中的 Redis 配置注释。
- 不新增依赖；运行时行为保持不变。
- 允许 ESLint、TypeScript 等工具必须识别的指令注释，豁免范围保持最小。
- 在 `AGENTS.md` 写明 Agent 不新增普通源码注释，需求与原因归入文档。
- 完成前运行 `npm run check` 和 `npm run build`。

## Review Focus

- ESLint 指令注释（如禁用规则）仍然生效，普通 TS/TSX 注释报错；由 ESLint 规则测试覆盖。
- TypeScript 三斜线引用仍能编译且获豁免；由规则测试和 typecheck 覆盖。
- CSS 行注释与块注释均被检测，字符串中类似注释的内容不误报；由 CSS 检查器测试覆盖。
- JSX 注释和 JSDoc 被识别为普通注释；由 ESLint 规则测试覆盖。
- `src/data/` 的 Redis 配置注释不受门禁影响；由检查目标范围测试覆盖。

---

### Task 1: 建立 TypeScript 注释门禁

**Files:**

- Modify: `eslint.config.ts`
- Create: `tests/no-source-comments.test.ts`

**Interfaces:**

- 规则从 ESLint `SourceCode.getAllComments()` 检查 `src/**/*.ts`、`src/**/*.tsx`。
- 仅允许 ESLint 工具指令与 TypeScript 三斜线指令；普通行注释、块注释、JSDoc、JSX 注释报错。

- [ ] **Step 1: 写失败测试**，覆盖普通行注释、块注释/JSDoc、JSX 注释、ESLint 指令、三斜线引用。
- [ ] **Step 2: 运行 Vitest**，确认普通注释用例因规则缺失失败。
- [ ] **Step 3: 在 `eslint.config.ts` 注册本地 ESLint 规则**，仅对 `src/**/*.{ts,tsx}` 生效。
- [ ] **Step 4: 运行规则测试**，确认普通注释报错且工具指令通过。

### Task 2: 建立 CSS 注释门禁并接入 lint

**Files:**

- Create: `scripts/check-css-comments.ts`
- Modify: `package.json`
- Create: `tests/check-css-comments.test.ts`

**Interfaces:**

- CSS 检查器只扫描 `src/**/*.css`，输出文件名与注释位置，发现普通注释时以非零状态退出。
- 检查器忽略字符串和转义内容；CSS 注释无工具指令豁免，除非现有源码证明确有需要。

- [ ] **Step 1: 写失败测试**，覆盖块注释、字符串内 `/* */`、转义引号及扫描范围。
- [ ] **Step 2: 运行 Vitest**，确认 CSS 检查器尚未实现。
- [ ] **Step 3: 实现 CSS 注释扫描**，使用 Node 原生文件 API，无新增依赖。
- [ ] **Step 4: 接入 `npm run lint`**，让 CSS 检查和 ESLint 一并执行。
- [ ] **Step 5: 运行 CSS 测试及 lint**，确认违规文件被拦截、现有合法源码通过。

### Task 3: 清理注释并更新工程文档

**Files:**

- Modify: `src/**/*.{ts,tsx,css}` 中含普通注释的手写源码
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-11-21-source-comments-design.md`
- Modify: `docs/superpowers/plans/2026-11-21-source-comments.md`

- [ ] **Step 1: 移除 `src/` 普通解释性注释与 JSDoc**，保留检查规则明确豁免的工具指令；不改字符串或 Redis 配置数据。
- [ ] **Step 2: 更新 `AGENTS.md`**，说明禁止 Agent 添加普通源码注释、文档承载需求和理由、工具指令为例外。
- [ ] **Step 3: 将 spec 状态改为「已实现」**，并在计划文件头标记「状态：已实现」。
- [ ] **Step 4: 运行 `npm run check` 与 `npm run build`**，确认 lint、格式、类型、测试和构建通过。
