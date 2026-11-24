# 运行时验证层设计（功能地图 + 浏览器冒烟）

日期：2026-11-24
状态：已实现
范围：为体检页与生成向导建立用户视角功能地图和可复现的浏览器冒烟验证，产出截图与导出文件作为审查证据。不改变产品行为。

## 意图：为什么做

正确性防线分两层：jsdom 单测与性质测试覆盖纯函数层；`npm run smoke` 在真实 chromium 里走核心链路（导入、密码不落盘、导出与二次确认、对比/详情、向导入口、持久化往返），截图与导出文件落 `.screenshots/smoke/`，UI 改动的验收看证据而非逐行读 diff。用户视角的功能与选择器地图在 [功能地图](../../engineering/feature-map.md)。

现状选择器面：产品代码没有 `data-testid`，但已有稳定的 aria-label 与中文文案可作锚点——区域 `你的配置` / `官方完整配置`、底部 `配置视图`（体检结果 / 配置对比 / 配置项说明）、工具栏 `Redis 版本` / `内联注释显示方式` / `中文摘要` 与按钮「上传 conf」「载入官方配置」「导出」「生成配置」「清空」「搜索配置项」、导出菜单三项文案、向导 `配置步骤` / `当前步骤` / `选择 Redis 版本` / `生成结果预览`。路由为 `/` 与 `/configurator`（`BrowserRouter`，`base: './'` + 404 副本兜底）。

## 目标与边界

目标：

- `docs/engineering/feature-map.md`：用户视角功能表（功能 / 路由 / 到达方式与选择器 / 什么证明它工作），覆盖体检页与向导，作为 Agent 驱动验证的地图。
- 仓库内 Playwright 冒烟：`e2e/smoke.spec.ts` + `playwright.config.ts`，`npm run smoke`；webServer 自动 build + preview（4173）。
- 冒烟链路：粘贴导入（含密码、已改、未知行）→ 通知与行数/已改计数断言 → `localStorage` 无明文 → 原样导出下载物含占位符不含明文 → 还原密码导出触发二次确认 → 对比/详情 tab 可见 → 向导入口可达 → 刷新后文本持久化往返；沿途截图与下载物存 `.screenshots/smoke/`。
- Vitest 排除 `e2e/`，`npm run check` 保持 jsdom-only 与现有速度。

非目标：

- 不把冒烟并入 `npm run check` 或 CI 部署门禁（浏览器依赖与耗时）；CI 集成另行评估。
- 不覆盖向导逐步填写全流程（首版只到入口与版本步）；不做视觉回归比对与性能基准。
- 不为测试向产品代码加 `data-testid`；不改产品行为与文案。
- 不引入运行时依赖。

## 方案

已选：**@playwright/test（devDependency）+ chromium，复用现有 aria-label/role/中文文案作选择器**。CodeMirror 输入用 click + `keyboard.insertText` 模拟真实键入；下载用 `page.waitForEvent('download')` 读内容断言；二次确认用 `page.on('dialog')` 断言文案后 accept；产物落 `.screenshots/smoke/`（已在 `.gitignore` 与 ESLint ignores）。

放弃的方案：

- **外部 Playwright 插件驱动（不进仓库）**：不可复现、无产物契约，失败不进入仓库回归闭环。
- **冒烟进 `npm run check`**：强制所有贡献者安装浏览器、check 变慢，与 jsdom 快门禁冲突。
- **为测试加 `data-testid`**：为测试污染产品代码；现有 aria/文案已足够稳定。
- **channel 复用系统 Edge/Chrome**：绑定本机浏览器，CI 与他机不可复现。
- **jsdom 模拟运行时**：已有单测覆盖，不触真实布局、弹出层与下载。

## 验收标准

- `npm run smoke` 本机通过，产出截图与导出文件于 `.screenshots/smoke/`。
- 断言覆盖：导入计数与密码通知、`localStorage` 无明文、原样导出含占位符不含明文、还原导出有二次确认、对比/详情可见、向导入口可达、刷新后文本往返。
- `npm run check` 与 `npm run build` 仍通过且不含浏览器测试；Vitest 不拾取 `e2e/`。
- `feature-map.md` 与真实选择器一致，以冒烟脚本为可执行核对。