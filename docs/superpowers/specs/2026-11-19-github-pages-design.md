# GitHub Pages 自动部署设计

日期：2026-11-19
状态：已实现
范围：为纯前端静态站增加 GitHub Actions 构建与 GitHub Pages 项目站点部署；不涉及运行时功能、数据生成脚本与仓库结构改造。

## 1. 意图：为什么做

工具目前只能在本地 `npm run dev` / `npm run preview` 使用。它是零后端的静态站，最合适的交付方式就是给一个固定链接：打开即用，配置内容不离开浏览器。用 GitHub Actions 在发布 Release 时构建并发布，可以保证线上永远等于该 tag 的构建产物，日常提交不会把未发版的代码推上线，且复用与本地相同的门禁。

## 2. 现状

- Vite 8 + React 19，[vite.config.ts](../../../vite.config.ts) 已经是 `base: './'`，产物资源走相对路径。
- `npm run build` = `lint` + `tsc --noEmit` + `vite build`；`npm run check` = `lint` + `format:check` + `typecheck` + `test`。
- 字典、官方 conf、`releases.json` 均已生成并提交进仓库；`scripts/fetch-upstream.ts` 与 `scripts/build-dict.ts` 只在本地手工运行，会访问 GitHub。
- 仓库 `ZRoger95/ZiLucidRedis` 为 public，主分支 `master`。
- `package-lock.json` 存在，`resolved` 指向 `registry.npmmirror.com`。
- 应用是单页，前端路由为 `/` 与 `/configurator`；构建产物额外生成 `404.html` 作为直接打开子路径时的兜底。
- 项目仓库单独绑定了子域名 `zilucidredis.zroger.top`，站点位于该子域名根路径；用户站点仓库仍以 `zroger.top` 为自定义域名，旧路径 `zroger.top/ZiLucidRedis/` 与 `github.io/ZiLucidRedis/` 都会 301 到子域名。
- [`.github/workflows/deploy.yml`](../../../.github/workflows/deploy.yml) 只有一个自动触发源：`release: types: [published]`，另有 `workflow_dispatch` 人工兜底；`push` 到 `master` 与 PR 都不触发任何 workflow。

## 3. 目标

- 访问 `https://zilucidredis.zroger.top/` 即可使用完整功能。
- 发布 Release（`published`）时自动构建并部署该 tag；保留 `workflow_dispatch` 手动重跑入口；push `master` 不部署。
- 部署前执行与本地一致的门禁：`npm run check` + `npm run build`。
- 不改 `base`、不改构建脚本、不新增仓库分支。

## 4. 非目标 / 反目标

非目标（本次不做）：

- 域名注册、DNS 托管与 Cloudflare 代理/证书配置（沿用已有的 `zroger.top`）。
- GitHub Pages 的 Enforce HTTPS 与 PR 预览部署。
- 在 CI 中运行 `scripts/fetch-upstream.ts` 或 `scripts/build-dict.ts`。
- 发布流程自动化（打 tag、changelog、版本号管理）。
- `push` 到 `master` 与 PR 上的 CI 门禁：门禁只在 Release 的 `build` job 里执行。
- 移动端适配或任何运行时功能改动。

反目标（做了也算失败）：

- 线上数据与仓库中提交的字典不一致，或 CI 每次构建都去上游抓取。
- 为了部署改动 `base`、引入环境变量或后端。
- 发布依赖人工把 `dist/` 推来推去。
- 使用长期存在的 `gh-pages` 分支作为发布通道。

## 5. 方案

已选：官方 Pages Actions，构建产物以 artifact 形式由 `deploy-pages` 发布，不产生发布分支。

单一工作流 `.github/workflows/deploy.yml`：

- 触发：`release: types: [published]` 是唯一自动触发源；`workflow_dispatch` 只作人工兜底，部署所选 ref。不监听 `push`，普通提交与 `git push --tags` 都不会发布。
- 权限：`contents: read`、`pages: write`、`id-token: write`；不改仓库默认 token 权限。
- 并发：`group: pages`、`cancel-in-progress: false`，避免部署被中途取消留下半成品。
- `build` job：`actions/checkout@v7` → `actions/setup-node@v7`（Node 24，启用 npm 缓存）→ `npm ci` → `npm run check` → `npm run build` → `actions/configure-pages@v6` → `actions/upload-pages-artifact@v5`（`path: dist`）。
- `deploy` job：`needs: build`，`environment: github-pages`，用 `actions/deploy-pages@v5` 发布，输出站点 URL。
- `npm run check` 与 `npm run build` 都会跑一遍 lint 与 tsc，重复几秒，换取与本地完全一致的门禁，不做脚本裁剪。
- 门禁落在发版这一刻：`npm run check` 失败的 Release 会红且不部署，线上不会出现未过门禁的构建；日常提交没有自动检查，靠本地 `npm run check`。

手动步骤（需要仓库管理员操作，一次性；2026-11-20 已确认 1–3 到位）：

1. Settings → Pages → Build and deployment → Source 选 **GitHub Actions**（首次部署前完成）。
2. Settings → Pages → Custom domain 填 `zilucidredis.zroger.top`；Cloudflare 加 `CNAME zilucidredis → zroger95.github.io`，先 DNS only 等 GitHub 完成校验与证书，再切到代理模式。
3. Settings → Environments → `github-pages` → Deployment branches and tags 选 **Selected branches and tags**，加一条 `master` 分支规则和一条 `v*` tag 规则；默认的「Protected branches only」只认分支，Release 用 tag 部署会被拒。
4. 可选：在 Actions 页面确认首个 `build` job 的 `npm ci` 耗时；若明显偏慢或超时，再处理镜像问题（见第 6 节）。
5. 可选：若以后启用 PR 流程，另加一个只在 `pull_request` 上跑 `npm run check` 的 workflow；部署仍只由 Release 触发。

放弃的方案：

- **`push: tags: ['v*']` 触发**：`git tag` 后直接推，流程更短；但 `git push --tags` 会一次性把所有本地 tag 推上去，误触发等于用旧提交覆盖线上，也没有版本记录可查。改为以 Release 发布作为唯一的自动触发点。
- **`release` 与 `push: tags` 都配**：建 Release 时如果 tag 是新建的，两个事件都会到，产生重复或竞态部署；只保留一个自动触发源。
- **`gh-pages` 分支 + `peaceiris/actions-gh-pages`**：需要长期维护发布分支、每次 force push、额外写入 token 通道，提交历史里混入构建噪音。官方现状是 artifact 部署，没有理由回到旧做法。
- **本地构建后手工上传**：线上与仓库脱节，门禁形同虚设，无法追溯是哪次发版。

## 6. 约束与风险

- **环境规则会挡住 tag**：`github-pages` 环境的「Deployment branches and tags」默认只允许受保护分支，Release 触发的 `deploy` 会以 `Tag "v0.1.0" is not allowed to deploy to github-pages due to environment protection rules` 失败；部署 ref 是 tag，必须在环境里显式允许 `v*`。
- **npm 镜像**：lockfile 的 `resolved` 指向 `registry.npmmirror.com`，GitHub runner 可达但可能偏慢。若首次部署在 `npm ci` 阶段超时，改用 `npm ci --replace-registry-host=always`（不修改 lockfile），仍不行再统一改写 lockfile 的源。
- **Pages 未启用**：Source 没选 GitHub Actions 时 `deploy` job 会失败，属于配置缺失而非代码问题。
- **数据漂移**：CI 只消费已提交的生成物，禁止在流水线里运行抓取脚本；上游更新仍走本地脚本 + 提交。
- **相对路径**：`base: './'` 适用于项目站点子路径，无需改成 `/ZiLucidRedis/`，也因此在本地根路径预览同样可用。
- **自定义域名**：域名由仓库 Settings 管理，源码不放 `CNAME` 文件；Cloudflare 开启代理时 GitHub 可能签不下证书，保持 DNS only 直到证书就绪。
- **`published` 也覆盖预发布**：发布时勾选 pre-release 同样触发部署，这是当前接受的语义——预发布也算一次上线。若以后要让预发布不上线，把触发类型换成 `types: [released]`（只在正式版发布、或把预发布改为正式版时触发）。
- **手动兜底会部署所选 ref**：`workflow_dispatch` 可以指定任意分支或 tag，等于绕过 Release；只用于修复线上紧急问题。

## 7. 验收

- 发布一次 Release 后，`build` 与 `deploy` 两个 job 全绿，Actions 输出可访问的站点 URL，部署记录挂在该 tag 上。
- push 到 `master` 不再产生任何 workflow 运行。
- `https://zilucidredis.zroger.top/` 能打开，样式、字典、CodeMirror 与本地 `npm run preview` 表现一致。
- 旧地址 `zroger95.github.io/ZiLucidRedis/` 与 `zroger.top/ZiLucidRedis/` 均 301 到新子域名。
- 页面没有绝对路径资源导致的 404；直接打开 `/configurator` 或刷新时 GitHub Pages 返回 `404.html`（`index.html` 的副本），应用正常渲染向导。
- README 写明线上地址，并说明部署由发布 Release 触发、push `master` 不部署。
