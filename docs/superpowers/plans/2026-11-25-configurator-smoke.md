# 向导全流程冒烟实施计划

状态：已实现

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 smoke suite 中新增「向导主链路」与「硬加载与刷新」两条 Playwright 用例，把向导的导航、填写、自由行、下载、带回与敏感值不落盘变成真实浏览器可执行核对，自动被现有 CI 继承。

**Architecture:** 只改 `e2e/smoke.spec.ts`（追加两条 test，复用 PLAINTEXT 常量与 `.screenshots/smoke/` 产物目录）。单版本走默认线 7.4；选择器复用 aria-label / role / 中文文案；预览断言读 `textContent` 保留换行；带回体检页后用 localStorage 全文 + Ctrl+F 查找定位规避 CodeMirror 虚拟渲染。

**Tech Stack:** @playwright/test（已有 devDependency）、chromium、vite preview（4173）。

**Spec:** `docs/superpowers/specs/2026-11-25-configurator-smoke-design.md`

## Global Constraints

- `ci.yml`、`deploy.yml`、`playwright.config.ts`、触发时机、产物目录一律不动。
- 不改产品行为与文案；不加 `data-testid`；不引入运行时依赖。
- 截图与下载物落 `.screenshots/smoke/`；retries 保持 0。
- 明文只出现在内存、下载物与预览断言中（fixture 假密码 `SmokePass123`）；两个 localStorage 键断言无明文。
- 工作区已有的 `docs/superpowers/plans/2026-11-24-ci-smoke.md` 状态行修正随本次一起提交（维护者已明确要求）；正常 `git commit` 触发 Hook，不推送。
- 完成前运行 `npm run check`、`npm run build`、`npm run smoke`。

## Review Focus

- 预览多行断言必须用 `textContent`（`toContainText` 归一化空白，save 两行相邻会退化）。
- 带回体检页后不得对 `.cm-content` 断言全文（CodeMirror 虚拟渲染）；用 localStorage + 查找定位。
- 用例二 reload 后向导回到版本步，需经导航跳步核对字段；敏感提示文案是「敏感值不保存，刷新后需重新填写。」。
- 硬加载断言旁注明 vite preview fallback ≠ GitHub Pages `404.html`，不等价线上验证。
- 新增代码过 ESLint（strict、perfectionist 导入排序）与 Prettier。

---

### Task 1: 用例一「向导主链路」

**Files:**

- Modify: `e2e/smoke.spec.ts`

**Interfaces:**

- 入口：体检页按钮「生成配置」→ `/configurator`；版本步 combobox「选择 Redis 版本」选 `7.4`（option 名以 `7.4 ·` 开头）。
- 导航：nav「配置步骤」内按钮按中文区域名跳转；改动数徽标与底栏「已改 N 项」同步。
- 字段：`getByLabel('port')` 填 6390、`getByLabel('maxmemory-policy')` 填 allkeys-lru、`getByLabel('save')` 填两行、`getByRole('switch', { name: 'appendonly' })` 点开、`getByLabel('requirepass')` 填 PLAINTEXT。
- 自由行：「添加一行」→「路径 1」/「命令 1」「新名 1」；textarea「ACL 用户规则」。
- 完成页：`pre[aria-label=生成结果预览]` 的 textContent 含九组生效行；「下载 conf」触发 dialog（含「明文密码」）与 download（`redis-7.4.conf`）；「带回体检页」回 `/`。
- 带回后：`zilucid:state` 含 `port 6390` 与 `${env_requirepass}` 无明文；「N 行 · 已改 N」已改 > 0；Ctrl+F 查找 `${env_requirepass}` 后 `.cm-content` 可见占位符；`zilucidredis.configurator.v1` 无明文。

- [ ] **Step 1: 写用例一**，沿链路截图（版本步、代表步、完成页、带回后）落 `.screenshots/smoke/`。

### Task 2: 用例二「硬加载与刷新」

**Files:**

- Modify: `e2e/smoke.spec.ts`

**Interfaces:**

- `page.goto('/configurator')`：h1「生成配置」、nav「配置步骤」、combobox「选择 Redis 版本」可见（旁注 fallback 机制差异）。
- 填 `port` 6390 + `requirepass` PLAINTEXT → `page.reload()`：URL 仍 `/configurator`；导航回「网络」步 `port` 值为 6390；回「安全」步 `requirepass` 为空且「敏感值不保存」提示可见；两个 localStorage 键无明文。

- [ ] **Step 1: 写用例二**，截图硬加载与 reload 后状态。

### Task 3: 验证与文档收尾

**Files:**

- Modify: `docs/superpowers/specs/2026-11-24-runtime-verification-design.md`
- Modify: `docs/engineering/feature-map.md`
- Modify: `docs/superpowers/specs/2026-11-25-configurator-smoke-design.md`
- Modify: `docs/superpowers/plans/2026-11-25-configurator-smoke.md`

- [ ] **Step 1: 运行 `npm run check`、`npm run build`、`npm run smoke`**，确认三者通过。
- [ ] **Step 2: 更新运行时验证 spec「缓行项优先级」现状**：向导冒烟已落地，下一项为外环自动化；feature-map 向导行补「硬加载 / 刷新」「自由行 / 下载 / 带回」的可执行核对口径。
- [ ] **Step 3: 本 spec 状态改「已实现」**，本计划文件头标「状态：已实现」。
- [ ] **Step 4: 新分支上正常 `git commit`**，把 `2026-11-24-ci-smoke.md` 状态行修正与本次交付一起提交；不推送。
