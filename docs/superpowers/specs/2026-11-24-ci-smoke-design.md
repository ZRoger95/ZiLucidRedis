# CI 冒烟集成设计

日期：2026-11-24
状态：已实现
范围：把 `npm run smoke` 接入 GitHub Actions：新增日常 CI workflow（push / PR 触发），并在发布 workflow 中插入冒烟门禁。不改变冒烟用例断言与产品行为。

## 意图：为什么做

[运行时验证 spec](2026-11-24-runtime-verification-design.md) 已落地本地冒烟，但它目前只靠本地自觉执行；「缓行项优先级」把 CI 冒烟集成排在第一位：CI 把本地自觉变成发布必过门禁，也是向导全流程冒烟与外环自动化的前提。

现状两个缺口：

- `.github/workflows/deploy.yml` 只在 Release published / `workflow_dispatch` 时触发，build job 跑 `npm ci → check → build` 后直接部署。冒烟失败（或根本没跑）不阻止发布，UI 回归只能靠发版前手动跑。
- 日常 push / PR 没有任何 CI 验证，`npm run check` 同样只靠本地自觉；问题积累到发版当场才暴露，修复压力集中。

仓库主分支为 `master`（远程 HEAD 已核对）。

## 目标与边界

目标：

- 新增 `.github/workflows/ci.yml`：push 到 `master` 与 pull_request 触发，跑 `npm ci → npm run check → npm run build → npx playwright install --with-deps chromium → npm run smoke`。只测试不部署，无副作用。
- `deploy.yml` build job 在 `npm run check` 之后、上传 Pages 产物之前插入同样的装浏览器 + `npm run smoke` 两步；触发时机与部署职责不变。冒烟失败则 build job 失败，deploy job 不执行。
- 两条 workflow 跑同一套 `npm run smoke`，不引入第二套测试逻辑。
- `playwright.config.ts` 做 CI 适配（见「方案」），本地 `npm run smoke` 行为不变。
- 冒烟失败时上传 `.screenshots/smoke/`（截图与导出文件）及 trace 目录（`.screenshots/smoke-results/`）为 workflow artifact，`if: failure()`；CI 失败可以下载证据定位，延续「看证据验收」。
- 验证方式：开分支提 PR 触发 ci.yml 验证整条链路（含故意破坏一处断言确认红叉与 artifact 产出），不依赖真实 Release。

非目标：

- 不做多浏览器矩阵与分片并行（单用例无意义）。
- 不做浏览器下载缓存（按 playwright 版本缓存 `~/.cache/ms-playwright`）；首版从简，CI 时长出现压力再做。
- 不做 CI 重试（retries 保持 0，红就是真红）；出现真实 flake 证据后另行讨论，与外环「误报率证据先行」口径一致。
- 不改冒烟用例断言、产品代码与文案；`e2e/` 仍不进 `npm run check`。
- 不在本次做向导全流程冒烟、nightly 模糊与视觉回归；顺序见运行时验证 spec 的「缓行项优先级」。
- 不设置 PR 合并的 required status check（分支保护规则属于仓库设置，是否启用由维护者另行决定）。

## 方案

已选：**双 workflow（新增 ci.yml + deploy.yml 插入冒烟）+ webServer 按环境区分构建 + 失败上传证据**。

- 门禁语义：ci.yml 管「早发现问题」，deploy.yml 管「坏版本出不去」。发布时刻无论日常 CI 状态如何都再验一次，堵住「CI 红着强行发 Release」的漏洞。
- webServer 契约变更：command 在 CI 下只跑 `npm run preview`（build job 已产出 dist，避免 lint + tsc + vite build 白跑第二遍）；本地保持 `npm run build && npm run preview` 的便利性。以 `process.env.CI` 区分。
- `playwright.config.ts` CI 适配：`reuseExistingServer: !process.env.CI`（CI 禁止复用陈旧 server 产生假绿）；reporter 在 CI 下追加 `github`（失败标注到 PR/commit）；`forbidOnly: !!process.env.CI`（防误提交 `test.only` 假绿）；retries 保持 0。
- 浏览器安装走 `npx playwright install --with-deps chromium`，ubuntu runner 访问官方 CDN，无本地镜像问题。
- `.screenshots` 是隐藏目录，upload-artifact 默认排除隐藏文件，两条 workflow 均设 `include-hidden-files: true`。
- 上传的 artifact 中 `export-secrets.conf` 含明文 `SmokePass123`，是 fixture 假密码，属预期且无风险，在此注明避免误判。

放弃的方案：

- **只在 deploy.yml 插入冒烟（单 workflow）**：改动最小，但冒烟失败只在发 Release 时暴露，反馈最晚；且验证 workflow 本身只能触发真实部署或发真实 Release，验证有副作用。
- **只加 ci.yml、deploy.yml 不动**：日常有反馈但发布无门禁，CI 红着仍可发版，违背「发布必过」的初衷。
- **CI 下 retries 设 1–2 次掩盖偶发失败**：无 flake 证据先加 retries 会掩盖真实回归，与确定性检查的项目口径冲突。
- **抽 reusable workflow 供两边调用**：两条 workflow 上下文不同（deploy 有 Pages 权限与并发组），复用节省的只是两行 run，抽象成本大于收益。
- **webServer 在 CI 也重复 build**：实现零改动，但每次 CI 白跑一遍 lint + tsc + build，浪费时长且模糊「build job 产物即部署产物」的对应关系。

## 验收标准

- PR 上 ci.yml 全绿；故意破坏一处 UI 断言后 ci.yml 红叉，且能下载截图与 trace artifact 定位。
- Release / `workflow_dispatch` 触发的 deploy.yml 中冒烟必过才部署；冒烟失败时 deploy job 不执行。
- 本地 `npm run smoke` 行为与产物路径不变；`npm run check` 与 `npm run build` 仍通过且不含浏览器测试。
- 实现完成后同步更新运行时验证 spec 的「缓行项优先级」现状（CI 冒烟已落地，下一项为向导全流程冒烟）。
