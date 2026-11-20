# 配置向导（/configurator）实施计划

状态：已实现 · 步骤按当时做法逐条勾选；Task 1 的 hash 路由后来换成 React Router 历史路由（`571b2b1`），`src/lib/routes.ts`、`src/hooks/useHashRoute.ts` 与 `tests/routes.test.ts` 已删除，当前路径是 `/configurator`。当前行为以 [设计文档](../specs/2026-11-19-configurator-design.md) 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 新增 `#/configurator` 配置向导：先选版本，再按官方 redis.conf 的区域一区一步，生成「官方模板 + 用户改动」的 conf，可导出或带回体检页。

**Architecture:** 纯前端 hash 路由把应用拆成体检页与向导页；`src/lib/configurator.ts` 用纯函数把字典拆成步骤、把草稿渲染成 conf；`src/data/configurator.json` 存放区域中文名、enum 候选值与插图映射。先补齐 6.2 字典缺口，再依次落地路由、纯函数、页面与导出。

**Tech Stack:** React 19、TypeScript strict、Vite 8、Vitest + Testing Library、Tailwind 4、shadcn 控件、`@lucasmarkes/hairline`。

**Spec:** [2026-11-19-configurator-design.md](../specs/2026-11-19-configurator-design.md)

## Global Constraints

- 纯前端，运行时零外部请求；hairline 在构建期打包进产物。
- 敏感值（`sensitive: true` 的指令与 `user ... >pass`）不写入任何存储，只留在内存。
- 生成数据不手改：`src/data/dict/*.json`、`src/data/official/*.conf`、`src/data/releases.json`、`src/data/dict/meta.json` 只由 `scripts/build-dict.ts` 重生成。
- 新增人工登记表 `src/data/extra-directives.json`、`src/data/configurator.json` 后，同步更新 [AGENTS.md](../../../AGENTS.md) 的「人工维护」清单。
- TypeScript strict，不新增 `any`；共享类型放 [types.ts](../../../src/types.ts)。
- 禁止直接使用 `useEffect`；新增 `src/hooks/useHashRoute.ts` 需登记到 [eslint.config.ts](../../../eslint.config.ts) 允许清单并写明原因（同步浏览器 URL）。
- 界面文案中文，按最小宽度 1024px 的桌面端设计；shadcn 控件只从 `@/components/ui/*` 子路径导入，新控件用 `npx shadcn@latest add textarea` 生成。
- `src/lib/` 是纯函数层，必须有 Vitest 单测；先写能复现的测试再改行为。
- 提交信息沿用 `feat:` / `fix:` / `docs:` / `test:` / `refactor:` 前缀。

## Review Focus

- 同名指令在官方 conf 里出现多次（`save` 三次、`client-output-buffer-limit` 三次）：只替换第一处，其余注释示例保留，生成的 conf 仍能启动。
- `include` 必须落在文件靠前位置，否则会被后面的同名指令覆盖（官方注释写明「Redis 总是用最后处理的值为准」）。
- 敏感值刷新后必须为空，且 localStorage 中搜不到明文。
- 6.2 的 7 条特殊指令不能被判成未知，也不能同时出现在 `MISC` 步。
- 不做任何改动时，输出与官方 conf 逐字节一致（行尾、末尾空行）。
- 切换版本后不能沿用旧版本草稿，否则会写出该版本不存在的指令。

---

### Task 1: 补齐 6.2 字典缺口并加覆盖率断言

**Files:**
- Create: `src/lib/freeLines.ts`
- Create: `src/data/extra-directives.json`
- Modify: `scripts/build-dict.ts`（`buildDictionary` 入参与合并逻辑、`main()` 断言）
- Modify: `src/data/no-default.json`
- Test: `tests/build/dict-coverage.test.ts`（新建）、`tests/build/build-dict.test.ts`（补充）

**Interfaces:**
- Produces:
  - `src/types.ts`：`export type FreeLineKind = 'include' | 'loadmodule' | 'user' | 'renameCommand'`。
  - `src/lib/freeLines.ts`：`export const FREE_LINE_NAMES: Set<string>`（`include`、`loadmodule`、`user`、`rename-command`）；`export const SECTION_FREE_LINES: Record<string, FreeLineKind[]>`（`INCLUDES: ['include']`、`MODULES: ['loadmodule']`、`SECURITY: ['user', 'renameCommand']`），类型从 `../types` 引入。
  - `buildDictionary({ line, tag, publishedAt, configC, officialConf, overrides, extras })`，`extras: Record<string, ExtraDirective>`，`ExtraDirective = { type: string; defaultValue: string | null; range: string | null; sensitive: boolean; modifiable: boolean }`。

- [x] **Step 1: 写覆盖率测试（先失败）**

`tests/build/dict-coverage.test.ts`：用 `node:fs` 读 `src/data/dict/*.json` 与 `src/data/official/*.conf`，对每个版本把官方 conf 的**生效行**（非空、非 `#` 开头）取首 token，断言该 token 属于「字典指令名 ∪ `FREE_LINE_NAMES`」。

```ts
const missing = activeToken not in names && !FREE_LINE_NAMES.has(activeToken);
expect(missingFor(version)).toEqual([]);
```

再补一条：`6.2` 字典必须包含 `bind`、`logfile`、`dir`、`save`、`client-output-buffer-limit`、`oom-score-adj-values`、`notify-keyspace-events`，且它们除 `notify-keyspace-events` 外都不是 `MISC` 区域。

- [x] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/build/dict-coverage.test.ts`
Expected: FAIL，6.2 列出上述 7 个缺失指令。

- [x] **Step 3: 新建 `src/lib/freeLines.ts`**

按 Interfaces 声明三个导出；`FREE_LINE_NAMES` 用 `Set` 常量，`SECTION_FREE_LINES` 只登记三个区域。

- [x] **Step 4: 新建 `src/data/extra-directives.json`**

```json
{
  "bind": { "type": "special", "defaultValue": null, "range": null, "sensitive": false, "modifiable": true },
  "logfile": { "type": "string", "defaultValue": "", "range": null, "sensitive": false, "modifiable": false },
  "dir": { "type": "special", "defaultValue": null, "range": null, "sensitive": false, "modifiable": true },
  "save": { "type": "special", "defaultValue": "3600 1 300 100 60 10000", "range": null, "sensitive": false, "modifiable": true },
  "client-output-buffer-limit": { "type": "special", "defaultValue": null, "range": null, "sensitive": false, "modifiable": true },
  "oom-score-adj-values": { "type": "special", "defaultValue": "0 200 800", "range": null, "sensitive": false, "modifiable": true },
  "notify-keyspace-events": { "type": "special", "defaultValue": "", "range": null, "sensitive": false, "modifiable": true }
}
```

- [x] **Step 5: 在 `buildDictionary` 合并缺失项**

在 `configC.entries.map(...)` 之后追加：遍历 `extras`，只处理「`officialConf.byName` 有同名指令、且当前 `directives` 里没有」的项，`section` 与 `comment` 取自官方 conf，其余字段取自 `extras`。顺序不参与排序，`section` 决定它在向导里的位置。

- [x] **Step 6: 把 3 条无默认值指令登记到 `src/data/no-default.json`**

追加 `bind`、`dir`、`client-output-buffer-limit`（保持数组格式与现有条目一致）。

- [x] **Step 7: 在 `main()` 加载 `extras` 并加构建期断言**

读取 `src/data/extra-directives.json` 传入 `buildDictionary`；在现有 `problems` 检查后追加：对 `officialConf` 的生效行 token 做与 Step 1 相同的覆盖检查，缺失即写进 `problems`。

- [x] **Step 8: 重新生成字典并检查差异**

Run: `node scripts/build-dict.ts`
Expected: 退出码 0，输出 10 行 `built ...`；`git diff --stat` 只涉及 6.2 字典、`meta.json`，且 6.2 指令数从 143 变成 150。

- [x] **Step 9: 运行测试**

Run: `npm test -- tests/build/dict-coverage.test.ts tests/build/build-dict.test.ts`
Expected: PASS。若 `build-dict.test.ts` 的既有断言因签名变化报错，同步补 `extras` 参数（默认 `{}` 时行为不变）。

- [x] **Step 10: Commit**

```bash
git add src/lib/freeLines.ts src/data/extra-directives.json src/data/no-default.json src/data/dict src/data/official scripts/build-dict.ts tests/build
git commit -m "fix: fill missing 6.2 directives and assert conf coverage"
```

### Task 2: hash 路由、入口切换与跨页交接

**Files:**
- Create: `src/lib/routes.ts`
- Create: `src/lib/handoff.ts`
- Create: `src/hooks/useHashRoute.ts`
- Create: `src/Root.tsx`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`（初始状态接受交接数据）
- Modify: `src/components/Toolbar.tsx`（新增「生成配置」按钮与 `onGenerate` 入参）
- Modify: `eslint.config.ts`（允许清单加 `src/hooks/useHashRoute.ts`）
- Test: `tests/routes.test.ts`、`tests/handoff.test.ts`（新建）、`tests/toolbar.test.tsx`（补充）

**Interfaces:**
- Produces:
  - `parseRoute(hash: string): 'checkup' | 'configurator'`；`routeHash(route): string`（`checkup → ''`，`configurator → '#/configurator'`）；`navigate(route): void`。
  - `setPendingConf({ line, text, vault }): void`、`takePendingConf(): { line: string; text: string; vault: Map<string, string> } | null`（读取后清空）。
  - `useHashRoute(): 'checkup' | 'configurator'`。
  - `Root` 组件：按路由挂载 `App` 或 `ConfiguratorPage`（Task 5 前先渲染占位 `<main>配置向导</main>`）。

- [x] **Step 1: 写路由纯函数测试（先失败）**

```ts
expect(parseRoute('#/configurator')).toBe('configurator');
expect(parseRoute('#/configurator/')).toBe('configurator');
expect(parseRoute('')).toBe('checkup');
expect(parseRoute('#/')).toBe('checkup');
expect(routeHash('configurator')).toBe('#/configurator');
```

- [x] **Step 2: 运行确认失败**

Run: `npm test -- tests/routes.test.ts`
Expected: FAIL，模块不存在。

- [x] **Step 3: 实现 `src/lib/routes.ts`**

`parseRoute` 去掉前导 `#`、去掉尾部 `/`、与 `/configurator` 全等比较；`navigate` 直接给 `window.location.hash` 赋值（其余为纯函数，`navigate` 才能碰 `window`，所以测试只断言 `parseRoute` / `routeHash`）。

- [x] **Step 4: 写交接测试（先失败）**

`tests/handoff.test.ts`：`setPendingConf` 后 `takePendingConf` 返回同一对象，第二次返回 `null`。

- [x] **Step 5: 实现 `src/lib/handoff.ts`**

模块级变量保存 `{ line, text, vault }`；`takePendingConf` 读出后置 `null`。注释写明：这是明文只走内存的通道，不写任何存储。

- [x] **Step 6: 实现 `src/hooks/useHashRoute.ts` 并登记允许清单**

`useState(() => parseRoute(window.location.hash))` + `useEffect` 监听 `hashchange` 后 `setRoute(parseRoute(...))`。在 [eslint.config.ts](../../../eslint.config.ts) 第 193 行的 `files` 数组加入 `'src/hooks/useHashRoute.ts'`，并在上一行注释里补一句原因。

- [x] **Step 7: 新建 `src/Root.tsx` 并改 `src/main.tsx`**

`Root` 读取 `useHashRoute()`；`configurator` 分支先放占位内容，Task 5 替换为 `ConfiguratorPage`。`main.tsx` 把 `<App />` 换成 `<Root />`。

- [x] **Step 8: `App` 接受交接数据**

在 `App` 顶部：`const [pending] = useState(() => takePendingConf());`，`line` / `text` / `vault` 的初始值优先取 `pending`，其余标记仍取 `loadState()`；`pending` 为空时行为与现在完全一致。补一条 `tests/app.test.tsx` 用例：先 `setPendingConf({ line: '7.4', text: 'port 6380\n', vault: new Map() })`，渲染后编辑器内容含 `port 6380`。

- [x] **Step 9: 工具栏加「生成配置」**

`ToolbarProps` 增加 `onGenerate: () => void`，按钮文案「生成配置」，放在「载入官方配置」左侧；`App` 传入 `() => navigate('configurator')`。`tests/toolbar.test.tsx` 补一条点击回调断言。

- [x] **Step 10: 运行测试**

Run: `npm test -- tests/routes.test.ts tests/handoff.test.ts tests/toolbar.test.tsx tests/app.test.tsx`
Expected: PASS。

- [x] **Step 11: Commit**

```bash
git add src/lib/routes.ts src/lib/handoff.ts src/hooks/useHashRoute.ts src/Root.tsx src/main.tsx src/App.tsx src/components/Toolbar.tsx eslint.config.ts tests
git commit -m "feat: add hash route and handoff for configurator"
```

### Task 3: 区域登记表、enum 候选与共享类型

**Files:**
- Create: `src/data/configurator.json`
- Modify: `src/types.ts`（`ConfiguratorSectionMeta`、`ConfiguratorRegistry`、`ConfiguratorStep`、`ConfiguratorDraft`）
- Modify: `AGENTS.md`（人工维护清单加两个新文件）
- Test: `tests/configuratorData.test.ts`（新建）

**Interfaces:**
- Produces:
  - `ConfiguratorRegistry = { sections: Record<string, { name: string; summary: string; figure?: string }>; enums: Record<string, string[]> }`
  - `ConfiguratorStep = { id: string; kind: 'version' | 'section' | 'extra' | 'finish'; title: string; directives: DirectiveDoc[]; freeLines: FreeLineKind[] }`
  - `ConfiguratorDraft = { v: 1; line: string; values: Record<string, string>; include: string[]; loadmodule: string[]; user: string[]; renameCommand: Array<{ command: string; target: string }> }`

- [x] **Step 1: 写登记表测试（先失败）**

`tests/configuratorData.test.ts` 断言：`src/data/dict/*.json` 里出现的每个 `section`（含 `MISC`）在 `sections` 中都有 `name` 与 `summary`；19 个 `type === 'enum'` 的指令名都在 `enums` 里且至少 2 个候选值。

- [x] **Step 2: 运行确认失败**

Run: `npm test -- tests/configuratorData.test.ts`
Expected: FAIL，文件不存在。

- [x] **Step 3: 写 `src/data/configurator.json` 的 `sections`**

26 个区域 + `MISC` 的中文名与一句话说明，原名作为 `title` 保留在字典里，这里只存副标题；`figure` 先留空，Task 8 再填。中文名与说明按 spec 第 5.2 节的措辞：例如 `NETWORK` → `网络 / 监听端口、绑定地址、超时与 TCP 参数`、`ADVANCED CONFIG` → `高级参数 / 编码阈值、缓冲区、hz、LFU`、`MISC` → `其他 / 官方模板未收录的指令`。

- [x] **Step 4: 写 `enums`**

按 19 个 enum 指令登记候选值，取值以官方 conf 注释为准。`shutdown-on-sigint` / `shutdown-on-sigterm` 登记 `default`、`save`、`nosave`、`now`、`force`；`maxmemory-policy` 登记 8 个策略；`loglevel` 登记 5 档；`syslog-facility` 登记 `USER` 与 `LOCAL0`–`LOCAL7`。

- [x] **Step 5: 补 `src/types.ts` 类型**

按 Interfaces 添加 `ConfiguratorSectionMeta`、`ConfiguratorRegistry`、`ConfiguratorStep`、`ConfiguratorDraft`；`FreeLineKind` 已在 Task 1 定义，这里只引用，不重复声明。

- [x] **Step 6: 更新 AGENTS.md 人工维护清单**

在底线约束的「人工维护的是」一句中追加 `src/data/extra-directives.json`、`src/data/configurator.json`。

- [x] **Step 7: 运行测试**

Run: `npm test -- tests/configuratorData.test.ts`
Expected: PASS；若某个新版本区域没登记，测试给出具体 id。

- [x] **Step 8: Commit**

```bash
git add src/data/configurator.json src/types.ts tests/configuratorData.test.ts AGENTS.md
git commit -m "feat: add configurator registry and types"
```

### Task 4: 步骤拆分与 conf 渲染纯函数

**Files:**
- Create: `src/lib/configurator.ts`
- Test: `tests/configurator.test.ts`（新建）

**Interfaces:**
- Produces:
  - `buildSteps(dict: DictFile): ConfiguratorStep[]`（顺序：`version`、各区域按 `startLine`、有 `MISC` 指令时的 `extra`、`finish`；区域步的 `freeLines` 取自 `SECTION_FREE_LINES`）。
  - `emptyDraft(line: string): ConfiguratorDraft`。
  - `changeCount(dict: DictFile, draft: ConfiguratorDraft): number`（`values` 条数 + 非空自由行条数）。
  - `renderConfig(officialText: string, dict: DictFile, draft: ConfiguratorDraft): string`。
  - `sectionComment(officialText: string, sectionId: string): string[]`（横幅后到第一条指令或下一个横幅之间的注释行）。

- [x] **Step 1: 写步骤不变量测试（先失败）**

对 10 个真实字典：`buildSteps` 的 `section`/`extra` 步合并后，每条 `dict.directives` 恰好出现一次；步顺序与 `sections.startLine` 一致；`MISC` 位于 `extra` 且是区域步的最后一个；`INCLUDES` 步的 `freeLines` 为 `['include']`。

- [x] **Step 2: 写渲染测试（先失败）**

用 `src/data/official/7.4.conf` 与 `src/data/dict/7.4.json`：

```ts
expect(renderConfig(official, dict, emptyDraft('7.4'))).toBe(officialNormalized);
expect(renderConfig(official, dict, { ...draft, values: { port: '6380' } })).toContain('\nport 6380\n');
```

再补：`save` 值为 `'900 1\n300 10'` 时出现两行 `save `；`include: ['/etc/redis/*.conf']` 插在 MODULES 横幅之前；`values: { 'prefetch-batch-max-size': '32' }` 追加在文件末尾的「官方模板未收录的指令」横幅之后；把 `client-output-buffer-limit` 改成 `client-output-buffer-limit replica 128mb 32mb 30` 后，输出里三种类别的注释示例仍各保留一行（共 3 行 `client-output-buffer-limit` 文本，其中 1 行生效）。

- [x] **Step 3: 运行确认失败**

Run: `npm test -- tests/configurator.test.ts`
Expected: FAIL，模块不存在。

- [x] **Step 4: 实现 `buildSteps` / `emptyDraft` / `changeCount`**

`buildSteps` 只遍历一次 `dict.directives` 分组，不要每个区域再扫全表；`MISC` 分组非空才追加。

- [x] **Step 5: 实现 `renderConfig`**

算法：按行切分官方文本；对每行取 `trim().replace(/^#+\s*/, '')` 的首 token，与 `values` 的键比对，**每个键只替换第一处**；替换行按值里的 `\n` 展开成多条 `name value`。自由行在所属区域的最后一条非空行之后插入，每种类型前置一行中文注释（`# 配置向导：include` 等）；`MISC` 指令追加到末尾横幅之后。结尾统一单个换行。

- [x] **Step 6: 实现 `sectionComment`**

从区域横幅下一行开始收集以 `#` 开头的行，遇到第一条非注释行或下一个横幅停止，去掉首尾空注释行。

- [x] **Step 7: 运行测试**

Run: `npm test -- tests/configurator.test.ts`
Expected: PASS。

- [x] **Step 8: Commit**

```bash
git add src/lib/configurator.ts tests/configurator.test.ts
git commit -m "feat: build configurator steps and render conf"
```

### Task 5: 向导页面骨架与导航

**Files:**
- Create: `src/components/configurator/ConfiguratorPage.tsx`
- Create: `src/components/configurator/StepNav.tsx`
- Create: `src/components/configurator/VersionStep.tsx`
- Modify: `src/Root.tsx`（换成 `ConfiguratorPage`）
- Modify: `src/components/ui/`（新增 `textarea.tsx`，由 CLI 生成）
- Test: `tests/configuratorPage.test.tsx`（新建）

**Interfaces:**
- Consumes: `loadDict` / `loadOfficialConf` / `RELEASES` / `formatVersionLabel`、`buildSteps`、`emptyDraft`、`changeCount`、`src/data/configurator.json`。
- Produces: `ConfiguratorPage` 组件；内部状态 `{ line, stepIndex, draft }`；`draft` 通过 props 传给 Task 6/7 的子组件（签名在本任务确定，后续任务只填实现）。

- [x] **Step 1: 安装 textarea**

Run: `npx shadcn@latest add textarea`
Expected: 生成 `src/components/ui/textarea.tsx`。

- [x] **Step 2: 写页面测试（先失败）**

`tests/configuratorPage.test.tsx`：渲染 `<ConfiguratorPage />`，等待字典加载；断言左栏出现「版本」与 `INCLUDES`；点「下一步」进入 `INCLUDES`；版本选择切换后草稿计数归零。

- [x] **Step 3: 运行确认失败**

Run: `npm test -- tests/configuratorPage.test.tsx`
Expected: FAIL，组件不存在。

- [x] **Step 4: 实现页面骨架**

三栏布局：顶部工具栏（版本 `Select`、「返回体检」按钮调 `navigate('checkup')`）、左侧 `StepNav`、中间当前步内容、底部「上一步 / 下一步」与「已改 N 项」。本任务中间列先渲染占位：区域步列出该步的指令名（`<li>`），完成页显示生成文本长度，Task 6/7 再换成真实组件。加载中显示与体检页一致的「正在加载 … 的配置项字典…」。

- [x] **Step 5: 实现 `StepNav`**

列表项显示序号、中文名（缺省用英文 `title`）、本步改动数；当前项高亮；容器 `overflow-auto`，滚动到选中项用 `ref` + `scrollIntoView({ block: 'nearest' })`。

- [x] **Step 6: 实现 `VersionStep`**

复用 `RELEASES` 反序列表与 `formatVersionLabel`；选择后重置 `draft = emptyDraft(line)` 并清空 `values` 与自由行。

- [x] **Step 7: 运行测试**

Run: `npm test -- tests/configuratorPage.test.tsx`
Expected: PASS。

- [x] **Step 8: Commit**

```bash
git add src/components/configurator src/components/ui/textarea.tsx src/Root.tsx tests/configuratorPage.test.tsx
git commit -m "feat: add configurator page shell and step navigation"
```

### Task 6: 字段控件与自由行编辑器

**Files:**
- Create: `src/components/configurator/DirectiveField.tsx`
- Create: `src/components/configurator/FreeLinesEditor.tsx`
- Create: `src/components/configurator/SectionStep.tsx`
- Modify: `src/components/configurator/ConfiguratorPage.tsx`（挂载区域步）
- Test: `tests/directiveField.test.tsx`、`tests/freeLinesEditor.test.tsx`（新建）

**Interfaces:**
- Consumes: `DirectiveDoc`、`ConfiguratorRegistry`、`ConfiguratorDraft`。
- Produces: `DirectiveField({ doc, value, changed, onChange })`（`onChange(value: string | null)`，`null` 表示恢复默认）；`FreeLinesEditor({ kind, draft, onChange })`；`SectionStep({ step, dict, registry, draft, onDraftChange })`。

- [x] **Step 1: 写控件测试（先失败）**

`bool` 渲染 `Switch` 且切换后 `onChange('yes'|'no')`；`enum` 渲染带 `datalist` 的 `Input` 且候选来自登记表；`sensitive` 渲染 `type="password"` 并出现「敏感值不保存」提示；点击「恢复默认」调用 `onChange(null)`；`special` 渲染 `Textarea`。

- [x] **Step 2: 写自由行测试（先失败）**

`renameCommand` 每行两个输入（命令、新名），空新名序列化为 `target: ''`；增删行回调正确；`include` 允许通配符字符串原样保留。

- [x] **Step 3: 运行确认失败**

Run: `npm test -- tests/directiveField.test.tsx tests/freeLinesEditor.test.tsx`
Expected: FAIL。

- [x] **Step 4: 实现 `DirectiveField`**

按 spec 第 5.3 节映射控件；字段上方显示名称（`font-mono`）、默认值、`range`；`modifiable === false` 时标注「需重启生效」；中文摘要优先取 `src/data/zh-notes.json`，缺失时取官方注释首行。

- [x] **Step 5: 实现 `FreeLinesEditor`**

四种类型的行编辑器，统一「添加一行 / 删除」按钮；`include` 与 `loadmodule` 用单行 `Input`，`user` 用 `Textarea`（多行按条拆分），`renameCommand` 用两个 `Input`。

- [x] **Step 6: 实现 `SectionStep` 并挂到页面**

顶部显示区域英文 `title`、中文名、`summary`，可折叠展示 `sectionComment` 的输出；字段用两列网格（`ADVANCED CONFIG` 自动两列，其余单列）；底部是本区域的自由行编辑器。

- [x] **Step 7: 运行测试**

Run: `npm test -- tests/directiveField.test.tsx tests/freeLinesEditor.test.tsx tests/configuratorPage.test.tsx`
Expected: PASS。

- [x] **Step 8: Commit**

```bash
git add src/components/configurator tests/directiveField.test.tsx tests/freeLinesEditor.test.tsx
git commit -m "feat: add configurator field and free line editors"
```

### Task 7: 完成页、下载、带回编辑器与草稿守卫

**Files:**
- Create: `src/components/configurator/FinishStep.tsx`
- Create: `src/lib/configuratorState.ts`
- Modify: `src/components/configurator/ConfiguratorPage.tsx`（持久化与完成页）
- Test: `tests/configuratorState.test.ts`、`tests/finishStep.test.tsx`（新建）

**Interfaces:**
- Consumes: `renderConfig`、`changeCount`、`replaceSecrets`、`setPendingConf`、`navigate`。
- Produces:
  - `loadDraft(line: string): ConfiguratorDraft | null`
  - `saveDraft(draft: ConfiguratorDraft, dict: DictFile): void`
  - `draftForStorage(draft: ConfiguratorDraft, dict: DictFile): ConfiguratorDraft`（纯函数，剔除敏感字段与 `user` 行）
  - `FinishStep({ line, text, changed, onBack, onDownload, onHandoff })`

- [x] **Step 1: 写守卫测试（先失败）**

`draftForStorage`：含 `requirepass`、`masteruser`、`user: ['user a on >p']` 的草稿，输出里没有这些值；非敏感字段与 `include` 保留。`loadDraft` 对损坏 JSON 返回 `null`。

- [x] **Step 2: 运行确认失败**

Run: `npm test -- tests/configuratorState.test.ts`
Expected: FAIL。

- [x] **Step 3: 实现 `src/lib/configuratorState.ts`**

localStorage 键 `zilucidredis.configurator.v1`；`saveDraft` 先过 `draftForStorage`；读取时校验 `v === 1` 与 `line` 匹配，否则返回 `null`。

- [x] **Step 4: 页面接入草稿**

进入页面时 `loadDraft(line)` 恢复；`draft` 变化时写入；切换版本先清空旧键再写新草稿。

- [x] **Step 5: 实现 `FinishStep`**

显示「共改 N 项」、生成文本预览（`<pre>`，等宽、可滚动、最多 24rem 高）、三个动作：「下载 conf」（`Blob` + `a.download = redis-${line}.conf`）、「带回体检页」、「返回修改」。含敏感值时在「下载」与「带回」旁显示明文提醒。

- [x] **Step 6: 接入带回编辑器**

`onHandoff`：`const { text } = replaceSecrets(generated)` → `setPendingConf({ line, text, vault })` → `navigate('checkup')`。注意 `vault` 只经内存传递。

- [x] **Step 7: 写完成页测试（先失败再通过）**

`tests/finishStep.test.tsx`：改动 2 项时显示「共改 2 项」；点下载触发 `URL.createObjectURL`（用 `vi.spyOn`）；点带回调用 `onHandoff`。

- [x] **Step 8: 运行测试**

Run: `npm test -- tests/configuratorState.test.ts tests/finishStep.test.tsx tests/configuratorPage.test.tsx`
Expected: PASS。

- [x] **Step 9: Commit**

```bash
git add src/lib/configuratorState.ts src/components/configurator tests/configuratorState.test.ts tests/finishStep.test.tsx
git commit -m "feat: add configurator export and draft guard"
```

### Task 8: hairline 插图

**Files:**
- Modify: `package.json`（新增依赖）
- Modify: `src/data/configurator.json`（填 `figure`）
- Modify: `src/components/configurator/ConfiguratorPage.tsx`（右侧插图面板）
- Test: `tests/configuratorFigures.test.ts`（新建）

**Interfaces:**
- Consumes: `@lucasmarkes/hairline/react` 的具名导出（`Router`、`Vault`、`Stack` 等）。
- Produces: 右侧插图面板；`configurator.json` 的 `figure` 字段为 React 导出名。

- [x] **Step 1: 安装依赖**

Run: `npm i @lucasmarkes/hairline`
Expected: `package.json` 与 lockfile 出现 `@lucasmarkes/hairline@^0.5.1`。

- [x] **Step 2: 写插图映射测试（先失败）**

`tests/configuratorFigures.test.ts`：`import * as figures from '@lucasmarkes/hairline/react'`，断言 `configurator.json` 里每个非空 `figure` 都存在于 `figures` 且类型为 `function`。

- [x] **Step 3: 运行确认失败**

Run: `npm test -- tests/configuratorFigures.test.ts`
Expected: FAIL，`figure` 均为空。

- [x] **Step 4: 填 `figure` 映射**

按下表填写，一张图只出现一次；版本步与完成页用保留键 `__version__`、`__finish__`：

| 区域 | figure | 区域 | figure |
|---|---|---|---|
| `INCLUDES` | `Patch` | `CLUSTER DOCKER/NAT support` | `Dish` |
| `MODULES` | `Plug` | `SLOW LOG` | `Terminal` |
| `NETWORK` | `Router` | `LATENCY MONITOR` | `Phosphor` |
| `TLS/SSL` | `Padlock` | `LATENCY TRACKING` | `Plot` |
| `GENERAL` | `Cabinet` | `EVENT NOTIFICATION` | `Riffle` |
| `SNAPSHOTTING` | `Drawer` | `ADVANCED CONFIG` | `Rebuild` |
| `REPLICATION` | `Relay` | `ACTIVE DEFRAGMENTATION` | `Branches` |
| `KEYS TRACKING` | `Loupe` | `SHUTDOWN` | `Rail` |
| `SECURITY` | `Vault` | `NON-DETERMINISTIC LONG BLOCKING COMMANDS` | `Slow` |
| `CLIENTS` | `Hub` | `APPEND ONLY MODE` | `Format` |
| `MEMORY MANAGEMENT` | `Basket` | `BACKUP / RESTORE` | `Lockers` |
| `LAZY FREEING` | `Sieve` | `MISC` | `Exploded` |
| `THREADED I/O` | `Turntable` | `__version__` | `Laptop` |
| `KERNEL OOM CONTROL` | `Elevator` | `__finish__` | `Terrain` |
| `KERNEL transparent hugepage CONTROL` | `Stack` | `REDIS CLUSTER` | `Settle` |

在 `tests/configuratorFigures.test.ts` 里同时断言 `__version__` 与 `__finish__` 存在且可用。

- [x] **Step 5: 渲染插图面板**

右侧固定宽度列：`<Figure intensity={0.4} theme="light" aria-hidden />`，外层设 `--hairline-plate` 为面板底色；窗口高度不足时只隐藏插图列（`hidden xl:block`），不压缩中间表单。

- [x] **Step 6: 运行测试与门禁**

Run: `npm test -- tests/configuratorFigures.test.ts`，然后 `npm run check`
Expected: PASS。

- [x] **Step 7: Commit**

```bash
git add package.json package-lock.json src/data/configurator.json src/components/configurator tests/configuratorFigures.test.ts
git commit -m "feat: add hairline figures to configurator"
```

### Task 9: 文档收口与全量门禁

**Files:**
- Modify: `README.md`（新增「生成配置」用法）
- Modify: `docs/superpowers/specs/2026-11-19-configurator-design.md`（状态 `待评审` → `已实现`，交接方式改为内存通道的描述）
- Modify: `docs/superpowers/plans/2026-11-19-configurator.md`（勾选完成项）
- Test: 全量

**Interfaces:**
- Consumes: 前八个任务的产物。
- Produces: 用户可见的用法说明与已实现状态的设计文档。

- [x] **Step 1: README 补用法**

在现有功能介绍后加一小节：入口按钮、先选版本、按区域分步、未改动保持官方注释、可下载或带回编辑器、敏感值不落盘。

- [x] **Step 2: 确认 spec 的交接描述并改状态**

核对第 5.1 节写的「`setPendingConf` 内存通道、不写存储」与实现一致，然后把状态从 `待评审` 改为 `已实现`。

- [x] **Step 3: 跑全量门禁**

Run: `npm run check; if ($LASTEXITCODE -eq 0) { npm run build }`
Expected: 两条命令退出码 0；`dist/index.html` 存在，`src="."` 相对路径仍生效。

- [x] **Step 4: 手工验收**

Run: `npm run dev`，依次验证 spec 第 7 节：`#/configurator` 直达与刷新、10 个版本步骤完整、改 `port` 与 `save` 后预览正确、空草稿输出等于官方 conf、敏感值刷新后为空且 localStorage 无明文、带回体检页后编辑器为 `${env_*}`。

- [x] **Step 5: Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: document configurator and mark design implemented"
```
