# GitHub Pages 自动部署实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** push 到 `master` 时由 GitHub Actions 构建，并把 `dist/` 发布到项目站点 `https://ZRoger95.github.io/ZiLucidRedis/`。

**Architecture:** 单个 workflow，`build` job 跑 `npm ci` + `npm run check` + `npm run build` 后上传 Pages artifact；`deploy` job 用官方 `deploy-pages` 发布，不产生发布分支。

**Tech Stack:** GitHub Actions、actions/checkout、actions/setup-node（Node 24）、actions/configure-pages、actions/upload-pages-artifact、actions/deploy-pages、Vite 8。

**Spec:** [2026-11-19-github-pages-design.md](../specs/2026-11-19-github-pages-design.md)

## Global Constraints

- 纯前端、运行时零外部请求：CI 只消费已提交的生成物，不运行 `scripts/fetch-upstream.ts` 或 `scripts/build-dict.ts`。
- 不改 [vite.config.ts](../../../vite.config.ts) 的 `base: './'`，不改 `package.json` 的脚本。
- workflow 权限只声明 `contents: read`、`pages: write`、`id-token: write`。
- `concurrency.group: pages`、`cancel-in-progress: false`。
- 界面文案中文；提交信息沿用 `feat:` / `fix:` / `docs:` 前缀。

## Review Focus

- 仓库 Settings → Pages 的 Source 未设为 **GitHub Actions** 时，`deploy` job 会失败；这是唯一一次性的手动步骤。
- `package-lock.json` 的 `resolved` 指向 `registry.npmmirror.com`，GitHub runner 上 `npm ci` 可能偏慢或超时。
- 页面资源必须走相对路径；改 `base` 会让子路径部署 404。
- 并发部署被新 push 取消会留下半发布状态；因此不允许 `cancel-in-progress: true`。
- 线上数据必须来自仓库中已提交的字典，CI 里抓上游会造成漂移。

---

### Task 1: 新增 Pages 部署工作流

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: 仓库根目录的 `package.json` 脚本 `check`、`build`；Vite 产物目录 `dist/`。
- Produces: Actions 中的 `build` job 与 `deploy` job；部署环境名 `github-pages`。

- [ ] **Step 1: 创建 `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 本地复跑工作流里的两条门禁命令**

Run: `npm run check; if ($LASTEXITCODE -eq 0) { npm run build }`
Expected: 两条命令退出码 0，`dist/index.html` 存在。

- [ ] **Step 3: 确认产物资源是相对路径**

Run: `Select-String -Path dist/index.html -Pattern 'src="\./|href="\./'`
Expected: 至少一条命中，说明 `base: './'` 生效，子路径部署不会 404。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: deploy to github pages on master"
```

### Task 2: README 补线上地址与部署说明

**Files:**
- Modify: `README.md`（在简介段之后、「使用」之前插入）

**Interfaces:**
- Consumes: Task 1 的 workflow 路径 `.github/workflows/deploy.yml` 与触发条件。
- Produces: 文档中唯一一处线上地址与发布方式的说明。

- [ ] **Step 1: 插入「线上版本」小节**

```markdown
## 线上版本

<https://ZRoger95.github.io/ZiLucidRedis/>

push 到 `master` 后由 GitHub Actions 构建并发布（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)），线上与 `master` 的构建产物一致；也可以在 Actions 页面手动重跑。
```

- [ ] **Step 2: 确认未与「本地开发」末尾的托管说明重复**

Run: `Select-String -Path README.md -Pattern 'GitHub Pages'`
Expected: 只多出 Step 1 插入的一处；「本地开发」末尾原句保留，不重复写发布流程。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: link deployed site in readme"
```

### Task 3: 启用 Pages 并验证首次发布

**Files:**
- Modify: `docs/superpowers/specs/2026-11-19-github-pages-design.md`（状态改为 `已实现`）

**Interfaces:**
- Consumes: Task 1 的工作流、Task 2 的文档。
- Produces: 状态为「已实现」的 spec；可访问的站点 URL。

- [ ] **Step 1: 用户操作 —— Settings → Pages → Source 选 GitHub Actions**

Expected: 页面显示当前来源为 GitHub Actions，且环境 `github-pages` 已创建。

- [ ] **Step 2: 推送到远端触发 workflow**

Run: `git push origin master`
Expected: Actions 中出现一次 `Deploy to GitHub Pages` 运行。

- [ ] **Step 3: 检查两个 job 结果**

Run: `gh run list --workflow deploy.yml --limit 1`
Expected: `build` 与 `deploy` 均为 success；若 `npm ci` 超时，改用 `npm ci --replace-registry-host=always` 并重新提交。

- [ ] **Step 4: 打开站点确认功能**

打开 `https://ZRoger95.github.io/ZiLucidRedis/`：样式正常、版本下拉有 10 条 minor 线、编辑器可输入、去重后的资源无 404。

- [ ] **Step 5: 把 spec 状态改为「已实现」并提交**

```bash
git add docs/superpowers/specs/2026-11-19-github-pages-design.md
git commit -m "docs: mark github pages design implemented"
```
