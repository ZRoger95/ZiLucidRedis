# 运行时验证层实施计划

状态：已实现

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立用户视角功能地图与仓库内浏览器冒烟，让 UI 改动的验收从读 diff 变为看截图与导出证据。

**Architecture:** 功能地图文档描述「功能 / 路由 / 选择器 / 证明」；Playwright 冒烟以该地图为脚本依据，webServer 自动 build + preview 后在真实 chromium 里走核心链路，截图与下载物落 `.screenshots/smoke/`。冒烟独立于 `npm run check`（jsdom 快门禁），Vitest 排除 `e2e/`。

**Tech Stack:** @playwright/test（devDependency）、chromium、Vite preview、现有 aria-label/role/中文文案选择器。

**Spec:** `docs/superpowers/specs/2026-11-24-runtime-verification-design.md`

## Global Constraints

- @playwright/test 仅进 devDependencies；首次运行前 `npx playwright install chromium`。
- 不改产品行为、文案与选择器；不为测试加 `data-testid`。
- `e2e/` 排除出 Vitest；`npm run check` 不含浏览器测试。
- 产物只写 `.screenshots/smoke/`，不提交（已在 `.gitignore`）。
- 完成前运行 `npm run check`、`npm run build` 与 `npm run smoke`。

## Review Focus

- CodeMirror 是 contenteditable：用 click + `keyboard.insertText`，不用 `fill` 假设 input。
- Radix Select/DropdownMenu 用 role（combobox / menuitem）与可见文案定位，不依赖内部 class。
- `saveState` 在 effect 中异步触发：断言 `localStorage` 前先等导入通知出现。
- download 与 dialog 事件需要先注册等待再触发点击，避免时序漏接。
- 还原密码导出的下载物**含明文是预期**（用户已确认）；断言重点是确认框出现且文案正确。

---

### Task 1: 功能地图文档

**Files:**

- Create: `docs/engineering/feature-map.md`

**Interfaces:**

- 表头：功能 / 路由 / 到达方式与选择器 / 什么证明它工作。
- 覆盖：粘贴/上传/拖拽导入、版本切换、内联注释三档、中文摘要开关、搜索面板、栏内查找、体检分组与跳转、缺失补入、对比 tab 与只看差异、单行恢复默认、详情 tab、导出三模式与二次确认、清空、向导入口与版本步、向导字段/自由行/完成页预览、持久化往返。
- 选择器以 spec「意图」节列出的 aria-label 与文案为准，与 Task 3 脚本互相核对。

- [ ] **Step 1: 写功能地图**，每行给出可执行的选择器与证明断言描述。
- [ ] **Step 2: 对照 `src/App.tsx`、`Toolbar.tsx`、`ExportMenu.tsx`、`EmptyState.tsx`、configurator 组件核对选择器存在**。

### Task 2: Playwright 基建

**Files:**

- Modify: `package.json`
- Create: `playwright.config.ts`
- Modify: `vite.config.ts`

**Interfaces:**

- `npm run smoke` = `playwright test`；testDir `e2e/`。
- webServer：`npm run build && npm run preview`，port 4173，reuseExistingServer。
- `vite.config.ts` 的 `test.exclude` 追加 `e2e/**`（保留 `configDefaults.exclude`）。
- 截图与下载物目录 `.screenshots/smoke/`。

- [ ] **Step 1: 安装 @playwright/test 与 chromium**。
- [ ] **Step 2: 写 playwright.config.ts 与 smoke script**，确认 webServer 能起 preview。
- [ ] **Step 3: Vitest 排除 e2e/**，运行 `npm test` 确认不拾取冒烟文件。

### Task 3: 冒烟用例

**Files:**

- Create: `e2e/smoke.spec.ts`

**Interfaces:**

- 导入 fixture：含 `requirepass` 明文、一条已改指令、一条未知指令的 conf 文本。
- 断言链：通知含密码替换计数 → 「你的配置」头计数 → `localStorage['zilucid:state']` 无明文 → 原样导出下载物含 `${env_` 不含明文 → 还原导出 dialog 文案 → 对比/详情 tab 内容可见 → 「生成配置」后 URL 为 `/configurator` 且版本步可见 → reload 后编辑器文本往返。
- 每个关键节点 `page.screenshot` 存 `.screenshots/smoke/`；下载物 `saveAs` 到同目录。

- [ ] **Step 1: 写导入与密码不落盘断言**，先跑通这一段。
- [ ] **Step 2: 写导出与二次确认断言**。
- [ ] **Step 3: 写 tab、向导入口与持久化往返断言**。
- [ ] **Step 4: 全量跑 `npm run smoke`**，确认截图与下载物产出。

### Task 4: 收尾

**Files:**

- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-11-24-runtime-verification-design.md`
- Modify: `docs/superpowers/plans/2026-11-24-runtime-verification.md`

- [ ] **Step 1: README「本地开发」补 `npm run smoke` 一行**（产物与浏览器安装说明链接到 spec）。
- [ ] **Step 2: 运行 `npm run check`、`npm run build`、`npm run smoke`**，确认三者通过。
- [ ] **Step 3: spec 状态改「已实现」并更新现状**，计划文件头标「状态：已实现」。