# GitHub Pages 自动部署设计

日期：2026-11-19
状态：待评审
范围：为纯前端静态站增加 GitHub Actions 构建与 GitHub Pages 项目站点部署；不涉及运行时功能、数据生成脚本与仓库结构改造。

## 1. 意图：为什么做

工具目前只能在本地 `npm run dev` / `npm run preview` 使用。它是零后端的静态站，最合适的交付方式就是给一个固定链接：打开即用，配置内容不离开浏览器。用 GitHub Actions 在 push 时构建并发布，可以保证线上永远等于 master 的构建产物，且复用与本地相同的门禁。

## 2. 现状

- Vite 8 + React 19，[vite.config.ts](../../../vite.config.ts) 已经是 `base: './'`，产物资源走相对路径。
- `npm run build` = `lint` + `tsc --noEmit` + `vite build`；`npm run check` = `lint` + `format:check` + `typecheck` + `test`。
- 字典、官方 conf、`releases.json` 均已生成并提交进仓库；`scripts/fetch-upstream.ts` 与 `scripts/build-dict.ts` 只在本地手工运行，会访问 GitHub。
- 仓库 `ZRoger95/ZiLucidRedis` 为 public，主分支 `master`，当前没有 `.github/` 目录。
- `package-lock.json` 存在，`resolved` 指向 `registry.npmmirror.com`。
- 应用是单页、无前端路由，只有 `index.html` 入口。

## 3. 目标

- 访问 `https://ZRoger95.github.io/ZiLucidRedis/` 即可使用完整功能。
- push 到 `master` 自动构建并部署；保留 `workflow_dispatch` 手动重跑入口。
- 部署前执行与本地一致的门禁：`npm run check` + `npm run build`。
- 不改 `base`、不改构建脚本、不新增仓库分支。

## 4. 非目标 / 反目标

非目标（本次不做）：

- 自定义域名、HTTPS 强制、PR 预览部署。
- 在 CI 中运行 `scripts/fetch-upstream.ts` 或 `scripts/build-dict.ts`。
- 发布流程自动化（打 tag、changelog、版本号管理）。
- 移动端适配或任何运行时功能改动。

反目标（做了也算失败）：

- 线上数据与仓库中提交的字典不一致，或 CI 每次构建都去上游抓取。
- 为了部署改动 `base`、引入环境变量或后端。
- 发布依赖人工把 `dist/` 推来推去。
- 使用长期存在的 `gh-pages` 分支作为发布通道。

## 5. 方案

已选：官方 Pages Actions，构建产物以 artifact 形式由 `deploy-pages` 发布，不产生发布分支。

单一工作流 `.github/workflows/deploy.yml`：

- 触发：`push` 到 `master`、`workflow_dispatch`。
- 权限：`contents: read`、`pages: write`、`id-token: write`；不改仓库默认 token 权限。
- 并发：`group: pages`、`cancel-in-progress: false`，避免部署被中途取消留下半成品。
- `build` job：`actions/checkout` → `actions/setup-node`（Node 24，启用 npm 缓存）→ `npm ci` → `npm run check` → `npm run build` → `actions/configure-pages` → `actions/upload-pages-artifact`（`path: dist`）。
- `deploy` job：`needs: build`，`environment: github-pages`，用 `actions/deploy-pages` 发布，输出站点 URL。
- `npm run check` 与 `npm run build` 都会跑一遍 lint 与 tsc，重复几秒，换取与本地完全一致的门禁，不做脚本裁剪。

手动步骤（需要仓库管理员操作，一次性）：

1. Settings → Pages → Build and deployment → Source 选 **GitHub Actions**（首次部署前完成）。
2. 可选：在 Actions 页面确认首个 `build` job 的 `npm ci` 耗时；若明显偏慢或超时，再处理镜像问题（见第 6 节）。
3. 可选：若以后启用 PR 流程，再把 `build` 加为 required status check；当前直接推 `master`，不做此配置。

放弃的方案：

- **`gh-pages` 分支 + `peaceiris/actions-gh-pages`**：需要长期维护发布分支、每次 force push、额外写入 token 通道，提交历史里混入构建噪音。官方现状是 artifact 部署，没有理由回到旧做法。
- **本地构建后手工上传**：线上与 master 脱节，门禁形同虚设，无法追溯是哪次提交发布。

## 6. 约束与风险

- **npm 镜像**：lockfile 的 `resolved` 指向 `registry.npmmirror.com`，GitHub runner 可达但可能偏慢。若首次部署在 `npm ci` 阶段超时，改用 `npm ci --replace-registry-host=always`（不修改 lockfile），仍不行再统一改写 lockfile 的源。
- **Pages 未启用**：Source 没选 GitHub Actions 时 `deploy` job 会失败，属于配置缺失而非代码问题。
- **数据漂移**：CI 只消费已提交的生成物，禁止在流水线里运行抓取脚本；上游更新仍走本地脚本 + 提交。
- **相对路径**：`base: './'` 适用于项目站点子路径，无需改成 `/ZiLucidRedis/`，也因此在本地根路径预览同样可用。

## 7. 验收

- push 一次 `master` 后，`build` 与 `deploy` 两个 job 全绿，Actions 输出可访问的站点 URL。
- `https://ZRoger95.github.io/ZiLucidRedis/` 能打开，样式、字典、CodeMirror 与本地 `npm run preview` 表现一致。
- 页面没有绝对路径资源导致的 404（无路由，不需要 404 兜底）。
- README 的「本地开发」附近补充线上地址，并说明部署由 push `master` 触发。
