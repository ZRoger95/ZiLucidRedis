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

- 不把冒烟并入 `npm run check`（浏览器依赖与耗时）；CI 集成已落地，见 [CI 冒烟集成 spec](2026-11-24-ci-smoke-design.md)。
- 首版不覆盖向导逐步填写全流程（只到入口与版本步）；该项已由 [向导全流程冒烟](2026-11-25-configurator-smoke-design.md) 落地（同一 smoke suite，自动被 CI 继承，无需二次集成）。
- 不做视觉回归比对与性能基准；视觉回归的触发条件是 UI 进入频繁改版期或出现真实视觉事故。
- 不为测试向产品代码加 `data-testid`；不改产品行为与文案。
- 不引入运行时依赖。

### 缓行项优先级

确认顺序：CI 冒烟集成 → 向导全流程冒烟 → 外环自动化（触发条件见 [性质测试 spec](2026-11-23-property-testing-design.md)）→ 视觉回归。每一步是下一步的前置：CI 把本地自觉变成发布必过门禁，也是外环的前提；向导冒烟扩覆盖面且自动进 CI。外环中「只报告型定时模糊」（nightly 跑更多轮/新 seed、只报告不合并）可提前到 CI 冒烟落地后顺手做；自动合并仍排最后。

CI 现状：已落地，见 [CI 冒烟集成 spec](2026-11-24-ci-smoke-design.md)。`ci.yml` 在 push master / PR 时跑 `check → build → smoke`；`deploy.yml` 在 build 之后、上传 Pages 产物之前插入冒烟，失败不部署。向导全流程冒烟现状：已落地，见 [向导全流程冒烟 spec](2026-11-25-configurator-smoke-design.md)，主链路与硬加载/刷新两条用例已进同一 smoke suite。外环首期（只报告型定时模糊）现状：已落地，见 [外环定时模糊 spec](2026-11-25-outer-loop-fuzz-design.md)，每周定时放大轮数跑现有四组不变量，失败只产报告。下一项：自动合并（需误报率与回滚率的长期证据）与视觉回归。

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
