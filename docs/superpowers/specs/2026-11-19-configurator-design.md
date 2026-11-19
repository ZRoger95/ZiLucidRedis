# 配置向导（/configurator）设计

日期：2026-11-19
状态：已实现
范围：新增一个按官方 redis.conf 区域分步的配置生成向导；覆盖全部区域与全部指令，不改运行时抓取、不改主页面体检流程。

## 1. 意图：为什么做

体检页的出发点是「已有 conf，帮你找问题」。用户还有另一半需求：手上没有 conf，想按官方结构一步步写出一份。官方 redis.conf 本身按 `#### NETWORK ####` 这类标题分区域，每个区域就是一段带解释的默认值注释，这是最好的向导骨架：用户看到的是官方原文，做的是填空题，而不是面对一张 200 行的表单。

这一版的目标不是给建议，而是**把区域模型打通**：每个区域、每条指令都能被看到、改到、导出。推荐配置、哨兵、集群拓扑再往后做。

## 2. 现状

- 每个版本的字典已带 `sections`（`id` / `title` / `startLine`，来自官方 conf 的横幅）和每条指令的 `section`，见 [types.ts](../../../src/types.ts) 的 `DictFile` / `DictSection`。
- 10 个版本（6.2–8.10）共 26 个区域上下，单版本指令 143–221 条。
- 应用没有前端路由，只有 [index.html](../../../index.html) 一个入口；[vite.config.ts](../../../vite.config.ts) 是 `base: './'`，线上走 GitHub Pages 静态托管。
- 官方 conf 原文随构建物一起提交（`src/data/official/*.conf`），`loadOfficialConf` 已能按版本读取。
- **字典缺口一：自由行指令**。`include`、`loadmodule`、`user`、`rename-command` 在所有版本的字典里都不存在：它们由配置加载器或 ACL 模块处理，不在 config.c 的 standard config 表里。官方 conf 里只以示例行出现（`# include /path/to/local.conf` 等）。
- **字典缺口二：6.2 的 7 条特殊指令**。6.2 的官方 conf 里有 `bind`、`logfile`、`dir`、`save`、`client-output-buffer-limit`、`oom-score-adj-values`、`notify-keyspace-events`，但 6.2 的 config.c 用 `config_set_special_field` 与手写分支处理它们，`parse-config-c.ts` 只认 `create*Config(` 调用，于是 7 条全部漏掉（6.2 字典 143 条，7.0 是 174 条）。`meta.json` 也因此误记为 `introducedIn: 7.0`。这是既有缺陷，体检页在 6.2 下会把这几行判成未知。
- 敏感指令已有占位与守卫：`requirepass`、`masterauth`、`tls-key-file-pass`、`tls-client-key-file-pass` 以及 `user ... >password` 会被 [secrets.ts](../../../src/lib/secrets.ts) 替换为 `${env_*}`，[persistence.ts](../../../src/lib/persistence.ts) 拒绝把明文写入 localStorage。

## 3. 目标

- 工具栏新增「生成配置」，进入 `#/configurator`；从体检页回来时编辑器内容不丢。
- 向导第一步选版本，默认沿用体检页当前版本；然后按官方区域一区一步；末尾有「官方模板之外的指令」与「完成」两步。
- 每条字典指令都能在所属区域被编辑；四个自由行区域提供专用编辑器。
- 生成结果为「官方 conf 原文 + 用户改动」：没动过的行保持官方注释原样，动过的指令取消注释并写入新值。
- 结束时支持预览、下载 `.conf`、带回体检页编辑器。
- 每一步右侧用一张 hairline 线稿插图（纯装饰）。

## 4. 非目标 / 反目标

非目标（本次不做）：

- 推荐配置、场景预设（缓存 / 会话 / 持久化数据库）、参数联动校验与「一键推荐」。
- 哨兵、集群拓扑编排、多实例生成。
- 连接真实 Redis 校验配置，或执行 `redis-server --test-memory` 之类的外部验证。
- 真实路径路由 `/configurator`、路径级 404 兜底。
- 把敏感值持久化到任何存储。
- 修复 6.2 之外的生成器结构问题，或把 `sentinel` 段落纳入向导。

反目标（做了也算失败）：

- 生成的 conf 与官方模板顺序不一致，或未改动的行被改写、注释被删除。
- 敏感值出现在 localStorage、默认导出或默认值里。
- 引入后端、运行时网络请求，或依赖 CDN 资源。
- 为了向导改动 `base`、新增第二套构建入口，或破坏体检页现有行为。
- 把 `include` / `loadmodule` / `user` / `rename-command` 当成普通字典指令硬塞进生成数据。

## 5. 方案

已选：**方案 A —— 严格一区一步**。区域顺序取 `dict.sections` 的 `startLine`，`MISC` 作为最后一个区域步；每步只放该区域的字段，空区域靠自由行编辑器承载内容。

放弃的方案：

- **方案 B（空区与 MISC 并入相邻页）**：步数只少两三步，却让「区域 = 步骤」不再一一对应，后续按区域加推荐规则时要额外维护映射。
- **方案 C（合并成 8 个大章节）**：更像安装程序，但引入一层官方不存在的概念，区域到章节的映射成为长期负担，也和「先摸清 section」的目标相反。

### 5.1 路由与页面骨架

- 路由用 hash：`#/configurator`，其余 hash 一律视为体检页。
- 新增 `src/lib/routes.ts` 纯函数：`parseRoute(hash): 'checkup' | 'configurator'`、`routeHash(route): string`。新增 `src/hooks/useHashRoute.ts` 监听 `hashchange`，并加入 [eslint.config.ts](../../../eslint.config.ts) 的 effect 允许清单（它同步的是浏览器 URL，属于 React 之外的系统）。
- [main.tsx](../../../src/main.tsx) 渲染一个 `Root`：按路由挂载 `App` 或 `ConfiguratorPage`，两个页面互斥挂载。
- 体检页状态在 `App` 内，切到向导再回来会重建 `App`；编辑器文本来自 `loadState()`，因此不丢。
- 「带回编辑器」通过内存交接：向导先用 `replaceSecrets` 把生成文本转成占位符，再通过 `setPendingConf` 交给体检页；文本与 vault 都只在内存里，不写任何存储。
- 放弃路径路由：`base: './'` 的静态托管下，`/configurator` 需要 404 兜底或服务端重写，GitHub Pages 上代价明显高于收益。

页面骨架（最小宽度 1024px，三栏）：

```
┌ 版本 SELECT   ·  返回体检 ─────────────────────────────┐
│ 步骤导航（左，可滚动） │ 当前区域表单（中） │ 插图与官方说明（右）│
│ 01 版本               │ NETWORK 网络        │  [hairline 线稿]  │
│ 02 INCLUDES  3 处改动 │ 端口      [6379 ]   │  官方原文说明…     │
│ 03 MODULES            │ …                   │  本区已改 3 项     │
│ …                     │                     │                   │
├ 上一步   下一步/完成   ·   已改 N 项   ─────────────────┤
```

步骤 01 是版本选择（复用 `RELEASES` 与 `formatVersionLabel`），最后两步是 `MISC`（存在指令时才出现）与完成页。

### 5.2 数据模型

`src/lib/configurator.ts` 只放纯函数：

```ts
type FreeLineKind = 'include' | 'loadmodule' | 'user' | 'renameCommand';

interface ConfiguratorStep {
  id: string;            // 区域 id，MISC 为 'MISC'，版本页为 '__version__'
  kind: 'version' | 'section' | 'extra' | 'finish';
  title: string;         // 区域标题（英文原样）
  directives: DirectiveDoc[];
  freeLines: FreeLineKind[];
}

interface ConfiguratorDraft {
  v: 1;
  line: string;
  values: Record<string, string>;                    // 只记录改动过的指令
  include: string[];
  loadmodule: string[];
  user: string[];
  renameCommand: Array<{ command: string; target: string }>;
}
```

- `buildSteps(dict)`：按 `sections.startLine` 生成区域步，指令按 `section` 落位；`MISC` 非空时追加为 `kind: 'extra'` 的最后一步。
- 自由行归属写在代码常量里：`INCLUDES → include`、`MODULES → loadmodule`、`SECURITY → user` + `renameCommand`。`TLS/SSL` 等区域的 `user` 不收。
- 区域中文名、一句话说明与插图的映射放在人工登记表 `src/data/configurator.json`：

```json
{
  "sections": {
    "NETWORK": { "name": "网络", "summary": "监听端口、绑定地址、超时与 TCP 参数", "figure": "Router" }
  },
  "enums": { "maxmemory-policy": ["noeviction", "allkeys-lru", "..."] }
}
```

- 19 个 enum 的候选值全部登记在这张表里（`shutdown-on-sigint` / `shutdown-on-sigterm` 是组合值，仍可作为候选提示）。缺失时退回纯文本输入，不阻塞。

### 5.3 控件映射

| 字典 `type` | 控件 |
|---|---|
| `bool` | `Switch`，on/off 写 `yes`/`no` |
| `enum` | `Input` + 原生 `datalist`（候选来自登记表） |
| `int` / `uint` / `sizet` 等数值 | `Input` 文本 + `range` 提示（值可能是 `1mb`、`100<<20`，不能用 `type=number`） |
| `string` / `sds` | `Input` |
| `special` | `Textarea`（多行，每行一条同指令） |
| `sensitive: true` | `Input type="password"`，加「不落盘」提示 |

每个字段展示：名称（等宽）、官方默认值、`range`、一句中文摘要（复用 `src/data/zh-notes.json`，没有则用官方注释首行）、「恢复默认」按钮。`modifiable: false` 的字段照常可编辑，但标注「需重启生效」。

放弃 `Select` 作为 enum 控件：`shutdown-on-sigint` / `shutdown-on-sigterm` 接受多值组合，`Select` 会丢掉合法输入；`datalist` 同时满足「给候选」与「允许自由输入」。

### 5.4 输出算法

`renderConfig(officialText, dict, draft): string` 是纯函数，永远从官方原文渲染，不基于上一次输出叠加：

1. 按行扫描官方 conf，识别每条指令所在行（去掉行首 `#` 与空白后，首 token 与指令名完全相等；注释示例行也算）。
2. 对 `draft.values` 里的每条指令，替换**第一处**匹配行为生效行：`name value`；值含换行时按行展开为多条同指令行。其余同名的注释示例保留，不影响运行。
3. 官方模板里没有的指令（`MISC`）统一追加到文件末尾，前置横幅 `# 官方模板未收录的指令（来自 config.c）`。
4. 自由行在**所属区域末尾**插入，各自带一行中文注释标题：
   - `include <path>`（支持通配符，行原样输出；官方建议放在文件靠前位置，本区域位于文件开头，满足该建议）
   - `loadmodule <path> [args...]`
   - `user <acl rules>`（原样输出；含 `>password` 时由 `replaceSecrets` 处理）
   - `rename-command <command> "<target>"`（`target` 为空串时输出 `""`，即禁用该命令）
5. 未改动的行逐字节保留；结尾统一为单个换行。

`draftChangeCount(dict, draft)` 统计 `values` 条数 + 非空自由行条数，用于导航与完成页。

### 5.5 草稿与敏感信息

- 草稿存 `localStorage`，键 `zilucidredis.configurator.v1`，与体检页状态分开；换版本时丢弃旧版本草稿（区域与指令都变了）。
- 写入前剔除 `sensitive: true` 的字段与 `user` 自由行：明文不落盘。刷新后这些字段为空，界面提示「敏感值不保存，请重新填写」。
- 下载与带回编辑器都把敏感值按现状写进内存文本；下载前沿用体检页的 `window.confirm` 明文提醒。

### 5.6 插图（hairline）

- 依赖 `@lucasmarkes/hairline`（v0.5.1，ESM、零依赖），React 入口 `@lucasmarkes/hairline/react`；构建期打进产物，运行时不发请求，符合纯前端约束。
- 每步右侧固定一张插图，映射写在 `configurator.json` 的 `figure` 字段；未登记的区域不渲染插图。
- 参数只用 `intensity={0.4}`、`theme="light"`、`aria-hidden`，不开 `play`；`--hairline-plate` 设为右侧面板底色，避免遮挡错位。
- hairline 是插图库，不是步骤条；步骤导航仍由现有 `Button` / `Tabs` / 原生列表组合。若插图在小宽度挤压表单，隐藏插图列优先于压缩表单。

### 5.7 前置修复：6.2 字典缺口

新增人工登记表 `src/data/extra-directives.json`，登记官方 conf 里存在、但 config.c 提取不到的指令（本次 7 条：`bind`、`logfile`、`dir`、`save`、`client-output-buffer-limit`、`oom-score-adj-values`、`notify-keyspace-events`，含 `type`、`defaultValue`、`range`、`sensitive`、`modifiable`）。[build-dict.ts](../../../scripts/build-dict.ts) 在 `configC.entries` 之后合并缺失项，然后重新生成全部字典。

放弃的替代方案：

- 手改 `src/data/dict/*.json`：违反「生成数据不手改」。
- 本次改写 `parse-config-c.ts` 去解析 6.2 的 if/else 分支：收益是自动覆盖，但要为 6.2 的旧结构写一套独立解析，风险与工作量都高于这 7 条登记项。
- 在向导层只做运行时兜底：体检页仍会把这几条判成未知，问题只被藏起来。

配套加一条测试：对每个版本，官方 conf 里所有生效指令行都必须能在字典里找到。这条断言会固定住本次修复，也能在未来上游新增指令时报警。

## 6. 约束与风险

- **步骤数量**：8.2 有 26 个区域 + 版本页 + `MISC` + 完成页，共约 29 步。左侧导航必须可滚动并显示改动数，否则用户会失去位置感。
- **单步体量**：`ADVANCED CONFIG` 一步 25–36 个字段。用两列网格 + 区域内的官方注释折叠面板消化，不为它单独做子步骤。
- **字典缺口**：除 6.2 的 7 条外，`scripts/build-dict.ts` 的 `MISC` 兜底仍会把「config.c 有、conf 没有」的指令标成 `MISC`（7.2 起 10–15 条）。这是预期行为，`MISC` 步骤就是给它们的。
- **有效期**：官方 conf 的横幅标题里 `KERNEL transparent hugepage CONTROL` 这类大小写混排要原样保留，中文名只做副标题。
- **发版影响**：新增 hairline 依赖与 textarea 组件会让产物变大；hairline 全部 33 张 gzip 约 64 kB，只 import 用到的张数。
- **测试环境**：`renderConfig` 依赖官方 conf 文本，测试直接读 `src/data/official/*.conf`，不 mock 文件系统。

## 7. 验收

- 工具栏点「生成配置」进入 `#/configurator`；浏览器前进/后退在两页之间正常切换；直接刷新 `#/configurator` 仍停留在向导。
- 版本选择与体检页版本独立；切换版本后草稿重置并提示。
- 遍历 10 个版本的步骤：每条字典指令恰好出现在一个步骤里；`include` / `loadmodule` / `user` / `rename-command` 出现在对应区域；`MISC` 指令出现在最后一步。
- 在任一区域改一个 bool、一个数值、一个多行 `special`，完成页预览出现对应的生效行，其余行与官方原文一致。
- 不填任何内容时，生成的 conf 与官方 conf 逐字节一致（行尾统一为 `\n`）。
- `save` 填多行时输出多条 `save` 行；`include` 填通配符路径时按原样输出在 INCLUDES 区域末尾。
- 输入 `requirepass` 与 `user ... >pass` 后刷新页面：字段为空并有提示，localStorage 里搜不到明文。
- 下载得到 `.conf`，带回体检页后编辑器内容与预览一致，且敏感值在编辑器中显示为 `${env_*}`。
- `npm run check` 与 `npm run build` 通过；新增断言「官方 conf 的生效指令都在字典里」在 10 个版本上全绿。
