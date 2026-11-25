# 向导全流程冒烟设计

日期：2026-11-25
状态：已实现
范围：在现有 `e2e/smoke.spec.ts` 冒烟套件中新增两条向导用例（主链路、硬加载与刷新），覆盖体检页到生成向导再带回的完整用户旅程。不改变产品行为与文案。

## 意图：为什么做

[运行时验证 spec](2026-11-24-runtime-verification-design.md) 的「缓行项优先级」中，CI 冒烟集成已落地，下一项是向导全流程冒烟。现有冒烟对向导只到「入口可达 + 版本步可见」；[向导 spec](2026-11-19-configurator-design.md) 的验收项（区域填写、自由行、完成页下载、带回体检页、敏感值不落盘、硬加载）目前只有 jsdom 单测覆盖，真实浏览器里的导航、弹出层、`window.confirm`、下载与 reload 没有可执行核对。

定位（已定）：**这是覆盖层扩展，不是新验证层**。只往现有 smoke suite 加 Playwright 用例；`ci.yml`、`deploy.yml`、`playwright.config.ts`、触发时机、产物目录一律不动，写完自动被现有 CI 继承，无需二次集成。

## 目标与边界

目标（两条用例，单版本走默认线 7.4）：

用例一「向导主链路」——客户端导航走通一次：

1. 体检页点「生成配置」进入 `/configurator`，在版本步确认选择 7.4 后进入区域步。
2. 左侧导航（nav「配置步骤」）跳转代表步，各填一个代表控件：bool（`appendonly` → yes）、数值（`port` → 6390）、enum（`maxmemory-policy` → allkeys-lru）、special 多行（`save` → `3600 1` 与 `300 100` 两行）、敏感（`requirepass` → 明文 fixture 假密码）；每步断言导航改动数徽标与底栏「已改 N 项」同步。
3. 四种自由行各一条：include 通配符（`/etc/redis/smoke-*.conf`）、loadmodule（`/opt/modules/smoke.so`）、`user smoke on ~* +@all >密码`、rename-command（CONFIG → smoke-config）；完成页预览断言对应生效行：`save` 展开两条、`user` 行原样、`rename-command CONFIG "smoke-config"` 带引号。
4. 完成页真实下载：断言含「明文密码」的 `window.confirm` 二次确认（已定纳入）、文件名 `redis-7.4.conf`、下载物含改动行与明文（fixture 假密码 `SmokePass123`，沿用体检侧口径）。
5. 「带回体检页」：编辑器出现生成内容、密码为 `${env_requirepass}`、体检计数正常（「N 行 · 已改 N」且已改 > 0）。
6. 体检页 `zilucid:state` 与向导 `zilucidredis.configurator.v1` 两个 localStorage 键均无明文。

用例二「硬加载与刷新」——jsdom 盲区专项：

7. `page.goto('/configurator')` 直接打开：不白屏、向导正常渲染（h1、步骤导航、版本选择可见）。**注意：vite preview 的 SPA fallback 与 GitHub Pages 的 `404.html` 兜底是两套机制，此断言不等价线上验证**；线上单层路径兜底的取舍见 [向导 spec](2026-11-19-configurator-design.md) 的「待处理」。
8. 填非敏感改动（`port`）+ 敏感值（`requirepass`）后真实 `page.reload()`：仍在向导、非敏感草稿恢复、敏感字段为空且出现「敏感值不保存」提示、localStorage 无明文。

非目标：

- 29 步全遍历、10 版本矩阵（jsdom 已覆盖步骤结构与逐版本落位）。
- 逐字段行为断言（控件映射、恢复默认等 jsdom 已覆盖）。
- 预览与官方原文逐字节比对（`renderConfig` 纯函数测试已覆盖）。
- 视觉回归、`data-testid`、改产品行为与文案。
- CI retries（保持 0）、改任何 workflow 与 `playwright.config.ts`。

## 方案

已选：**在 `e2e/smoke.spec.ts` 追加两条 test，复用现有 aria-label / role / 中文文案与 `.screenshots/smoke/` 产物契约**。

- 代表控件定位用 `getByLabel(指令名)`（label 与 aria-label 双锚点，enum 的 `input[list]` 是 combobox role，用 label 定位可避开 role 差异）；bool 用 `getByRole('switch')`；导航跳转用 nav 内按钮的中文区域名（「网络」「快照持久化」「安全」「内存管理」「AOF 持久化」「包含其他配置文件」「模块加载」「完成」）。
- 完成页预览断言读 `pre[aria-label=生成结果预览]` 的 `textContent` 后用字符串包含判断，保留换行——`toContainText` 会归一化空白，无法断言 `save` 两行相邻展开。
- 带回体检页后，生成 conf 有两千余行，CodeMirror 虚拟渲染只渲染可视区，不能对 `.cm-content` 断言全文。改为：localStorage 全文断言（含 `port 6390`、`${env_requirepass}`、无明文）+ 编辑器计数断言 + 用栏内查找（Ctrl+F，search「在你的配置中查找」）定位 `${env_requirepass}` 行使占位符进入可视区后再断言 `.cm-content`。查找定位本身也是真实用户动作。
- 下载沿用 `page.waitForEvent('download')` + `saveAs`；二次确认沿用 `page.on('dialog')` 断言文案后 accept。
- 用例二独立 test（Playwright 每 test 独立 context，localStorage 干净），reload 后向导回到版本步（stepIndex 不持久化），经导航跳到对应区域步核对字段值。

放弃的方案：

- **独立 spec 文件 / 独立 suite**：同一 suite 内共享 fixture 常量与产物目录即可，拆文件不带来隔离收益，反而分散冒烟入口。
- **对 `.cm-content` 断言生成全文**：CodeMirror 虚拟渲染下必然假红；localStorage 是持久化事实源，配合查找定位覆盖可视渲染。
- **用 `toContainText` 断言预览多行相邻**：空白归一化会让「两行相邻」退化为「两个词存在」，改用 `textContent` 字符串包含。
- **把硬加载断言当线上验证**：vite preview fallback 与 GitHub Pages `404.html` 机制不同，只能证明应用自身硬加载不白屏，线上兜底仍靠部署侧机制，spec 中显式注明边界。
- **全遍历 + 版本矩阵**：浏览器层慢且脆，结构正确性已由 jsdom 单测与「官方 conf 生效指令都在字典里」断言固定，浏览器层只走代表性链路。

## 验收标准

- `npm run smoke` 本机通过，三条用例全绿；新增截图与下载物落 `.screenshots/smoke/`。
- 新增断言覆盖：导航改动数同步、五类代表控件生效行、四种自由行生效行（save 两条 / user 原样 / rename-command 带引号）、下载二次确认与文件名与内容、带回后占位符与计数、两个 localStorage 键无明文、硬加载不白屏、reload 后草稿恢复与敏感字段清空提示。
- `npm run check` 与 `npm run build` 仍通过；`ci.yml`、`deploy.yml`、`playwright.config.ts` 零改动。
- 实现完成后更新运行时验证 spec「缓行项优先级」现状（向导冒烟已落地，下一项为外环自动化）；[功能地图](../../engineering/feature-map.md) 向导行的可执行核对范围随之扩大。
