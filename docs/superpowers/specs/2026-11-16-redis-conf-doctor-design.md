# Redis 配置体检工具（ZiLucidRedis）设计

日期：2026-11-16
状态：已实现

## 1. 意图：为什么做

运维手上的 `redis.conf` 通常是被裁剪过、被手改过的版本：注释丢了或只剩一半，而官方完整
`redis.conf` 有近 200 个配置项。结果是改一个参数前不确定它做什么、默认是多少、改错了会
怎样，只能去翻文档或凭记忆。

要做的是一个**在线工具型网站**（不是文档站、不是 diff 工具）：把一份 conf 贴进去或上传，
逐项得到「这是什么 / 默认值 / 取值范围 / 我改没改 / 是否废弃」，可以就地改值，最后导出
一份可用的新 conf。

## 2. 用户与成功标准

用户：运维 / 后端开发，拿到一份二手 Redis 配置，要在上线前确认配置是否合理。

成功的样子：
- 把一份没注释的 conf 贴进去，30 秒内看清哪些项被改过、哪些项不认识、有没有危险组合。
- 想改某个参数时，不离开页面就知道它的作用和默认值，改完直接导出，不需要手抄格式。

需求对照（每条原始要求落在哪一节）：

| 要求 | 落地位置 |
|---|---|
| 在线、打开就能用 | 纯前端静态站，可托管，也可离线双击打开（6.1 / 6.8） |
| 拿一份 conf 对比官方默认值 | 6.4 逐行状态 + 底部「体检结果」面板 |
| 标记每个配置项有什么用、默认值多少 | 6.6 内联官方注释 + 右侧详情面板 |
| 官方配置项太多，不知道从哪看 | 6.6 快速搜索（Ctrl+K），可按分组浏览并插入未配置项 |
| 要能修改 | 6.6 编辑器内直接改，详情面板提供默认值参照 |
| 改完导出新 conf | 6.7 三种导出 |

## 3. 已定方案

对话中确认：**A 为主 —— 文档式编辑器 + 底部体检结果面板**，不做表格式全量面板，不做两文件 diff。

- **左栏：你的配置** —— 类 redis.conf 的文本编辑器（行号、等宽、行内标记），唯一编辑入口。
- **右栏：官方完整配置** —— 当前版本的官方 `redis.conf` 原文，只读、带行号；光标停在哪条指令，右栏就滚到官方对应行并高亮。
- 底部「体检结果」默认页签：已改 / 未知 / 已移除 / 告警 / 重复 / 重要项缺失分组计数，点击明细跳到对应行。
- **下方左侧：配置对比表** —— 行号 / 指令 / 你的配置 / 官方默认 / 状态，差异单元格高亮，点击跳行。
- **下方右侧：配置说明** —— 当前值与默认值对比卡片、中文摘要、官方英文注释。
- **内联注释（两栏共用）** —— 指令上方折叠显示「作用 · 默认值：X」；作用取自 `zh-notes.json` 的中文摘要，摘要末尾与新默认值重复的「，默认 X」子句会被去掉；没有中文摘要时回退为「官方注释 · 默认值：X」。左栏按「只补缺失 / 全部显示 / 关闭」过滤，右栏只给官方 conf 自身缺注释的指令补齐。
- 下方 tabs 右侧有「收起 / 展开」按钮，收起后只留标签栏，编辑区自动变高。
- 快速搜索面板（Ctrl+K）：按名称/分组/注释关键词找配置项，可把文件中没有的项插进来。

## 4. 非目标（v1 不做）

- 不做两份 conf 的 diff。
- 不做 `sentinel.conf`、ACL 文件（`users.acl`）、模块自有配置的语义校验
  （`loadmodule` 的参数只做原样展示）。
- 不连接真实实例读取 `CONFIG GET`（纯前端，无后端）。
- 不做账号体系、云端保存、分享链接。
- 不翻译全部官方注释（见 6.2 的中文摘要范围）。
- 不生成 Dockerfile / compose / 集群拓扑。
- 不支持 Redis 6.0 及更早。

## 5. 数据来源

两个官方来源，各取所长：

| 来源 | 用途 |
|---|---|
| `<tag>/src/config.c` 里的 189 个 `create*Config(...)` 定义 | 权威指令名、类型、默认值、是否敏感、是否可运行时修改 |
| `<tag>/redis.conf` 的完整注释版 | 分节标题、指令上方注释原文、示例写法 |

已实测可取（根目录 `redis.conf`，`src/config.c`）：`6.2.19`、`7.2.9`、`7.4.5`、`8.10.3`。
构建期下载进仓库，解析成结构化字典提交入库，随前端静态发布。**运行时不请求任何外部网络。**

## 6. 设计

### 6.1 技术形态

- 纯前端静态站：Vite + React + TypeScript，无后端、无数据库。
- `vite.config.ts` 设 `base: './'`：构建产物既能托管上线，也能直接双击 `index.html`
  在无网络环境使用（字典随包发布，运行时不发请求）。
- 编辑器：CodeMirror 6，自定义轻量装饰层（不引入完整 conf 语法包）：
  - gutter 标记：已改（黄）、未知（红）、已移除（灰）、告警（橙）、版本不适用（紫）。
  - 行背景浅色底，只做装饰，不改写用户文本。
- 样式：Tailwind CSS。
- 所有解析与导出在浏览器内完成，文件离开浏览器的方式只有用户主动下载。
- `localStorage` 只保存：所选版本、各开关状态、以及**已做密码占位符替换后的文本**。
  原始密码永远不写入任何存储（见 6.6）。

### 6.2 配置项字典的生成

`data/versions.json` 按 minor 线覆盖，只写线号：

```json
[
  { "line": "6.2" }, { "line": "7.0" }, { "line": "7.2" }, { "line": "7.4" },
  { "line": "8.0" }, { "line": "8.2" }, { "line": "8.4" }, { "line": "8.6" },
  { "line": "8.8" }, { "line": "8.10" }
]
```

[`scripts/fetch-upstream.ts`](../../../scripts/fetch-upstream.ts) 通过 GitHub Releases API
（只取正式版）解析每条 minor 线最新的 patch tag 与发布日期，写进 `data/upstream/lock.json`；
API 不可用时沿用 lock.json 里上一次的 tag，保证构建可离线复现。各线当前使用的 tag 以
`lock.json` 为准，不在文档里手抄。

同一脚本下载 `<tag>/redis.conf` 与 `<tag>/src/config.c` 到 `data/upstream/<line>/`，
文件已存在且该线的 tag 未变化则跳过；单文件请求失败重试 3 次
（实测 raw.githubusercontent.com 偶发连接超时）。

[`scripts/build-dict.ts`](../../../scripts/build-dict.ts) 产出 `src/data/dict/<line>.json`
（每版本一份，按需加载）、`src/data/dict/meta.json`、`src/data/releases.json`，
同时把官方 `redis.conf` 原文复制到 `src/data/official/<line>.conf`，
供右栏只读展示与「载入官方配置」使用。

```jsonc
{
  "line": "7.4", "tag": "7.4.5",
  "sections": [{ "id": "NETWORK", "title": "NETWORK" }],
  "directives": [{
    "name": "maxclients",
    "section": "NETWORK",
    "type": "uint",
    "defaultValue": "10000",
    "defaultSource": "config.c",   // config.c | conf-comment | override | none
    "range": "1..UINT_MAX / 10000",  // 有区间信息时
    "sensitive": false,
    "modifiable": true,
    "comment": ["Set the max number of connected clients at the same time.", "..."]
  }]
}
```

**config.c 解析规则**
- 匹配 `create<Type>Config("name", ...)`，第一个字符串字面量即指令名。
- 默认值按类型取：
  - `createBoolConfig` → `0/1` 实参 → `no/yes`
  - 数值型（`createIntConfig` / `createUIntConfig` / `createLongLongConfig` /
    `createULongLongConfig` / `createSizeTConfig` / `createTimeTConfig` /
    `createOffTConfig` / `createDurationConfig`）→ 对应实参字面量；带 `MEMORY_CONFIG`
    标记的按字节存，UI 另给人类可读写法（`1gb`）。
  - `createEnumConfig` → 实参是枚举常量（如 `MAXMEMORY_NO_EVICTION`），用同文件里的
    枚举定义表 `{"noeviction", MAXMEMORY_NO_EVICTION}` 反查成字符串。
  - `createStringConfig` / `createSDSConfig` → 字面量或 `""`；`EMPTY_STRING_IS_NULL` 视为空。
  - `createSpecialConfig`（`save`、`client-output-buffer-limit`）→ 退回官方 conf 中该指令
    最后一条不含 `<>` 的注释示例行（`save` 因此得到 `3600 1 300 100 60 10000`）。
- 标志位含 `SENSITIVE_CONFIG` 即 `sensitive: true`，驱动密码占位符。
- 遇到没见过的创建函数或写法：写入构建日志，落到待人工确认清单，不静默忽略。

**注释与分节**
- 用 redis.conf 的 `####... SECTION ####` 行切分节。
- 指令注释取「该指令名首次在 conf 中出现的那一行之前、连续的 `#` 注释块」，去掉前缀与
  首尾空行；找不到则 `comment: []`，UI 显示「官方 conf 未提供注释」。

**构建断言（失败即中断并打印缺失清单）**
- 每版本指令数 140–260、分节数 ≥ 8。
- `maxmemory` / `maxmemory-policy` / `protected-mode` / `appendonly` / `requirepass`
  的默认值必须可解析（`requirepass` 允许空字符串）。
- 任何 `defaultValue === null` 的名字必须出现在 `src/data/no-default.json`
  （人工确认“确实无默认值”），否则构建失败。
- `src/data/defaults-override.json` 可覆盖个别解析结果，每条必须带 `reason`。

**跨版本索引 `src/data/dict/meta.json`**

```jsonc
{
  "maxclients":                  { "introducedIn": "6.2", "removedIn": null, "renamedTo": null },
  "aof-load-corrupt-tail-max-size": { "introducedIn": "8.4", "removedIn": null },
  "hash-max-ziplist-entries":    { "introducedIn": "6.2", "removedIn": "7.0",
                                   "renamedTo": "hash-max-listpack-entries" }
}
```

`renamedTo` 由「旧名消失 + 新名出现 + 词干相似」提出候选，人工确认后才写入；
宁可漏报也不自动生效。人工表：
- `src/data/aliases.ts`：仍被 Redis 接受的旧名（`slaveof`、`slave-read-only` 等），
  命中后按新名查字典，详情里注明「旧名」。
- `src/data/zh-notes.json`：约 40 个高频项的一句话中文摘要，显示在英文注释之上。
- `src/data/risk-rules.json`：见 6.5。

### 6.3 用户 conf 的解析

`src/lib/parseConf.ts` 输出按行组织的结果，**保留原始文本与行号**（导出要原样保序）：

```ts
type Line =
  | { kind: 'blank' | 'comment' | 'unknown'; lineNo: number; raw: string }
  | { kind: 'directive'; lineNo: number; raw: string;
      name: string; args: string[]; quoteStyles: ('plain'|'double'|'single')[] }
```

- 行首空白忽略；`#` 开头为注释；空行为 blank。
- 指令名 = 首个 token，匹配 `^[A-Za-z][A-Za-z0-9-]*$`；其余按引号切分（双引号内支持
  `\"` `\\` 转义）。
- 含 `<`、`>`、`|` 等模板符号的行按 unknown 处理，提示「看起来是文档模板而非配置」。
- `include` / `loadmodule` 单独识别，只提示（不展开被包含文件）。
- 导入后的规范化：`normalizeConfig` 去掉注释行与空行，按官方 conf 中该指令首次出现的位置排序，
  官方 conf 里没有的指令保持原相对顺序排在末尾；保留原始行文本，因此引号与转义不变。
- 保留原行文本与引号风格，供导出时原样回写。

### 6.4 分析

`src/lib/analyze.ts` 输入 `(lines, dict, meta, version)`，产出每行状态与全局摘要。
查表顺序：当前版本字典 → 别名表 → 跨版本索引 → unknown。

| 状态 | 判定 |
|---|---|
| `default` | 命中且参数与默认值归一化后相等 |
| `changed` | 命中且与默认值不等 |
| `no-default` | 命中但字典无默认值（不参与“偏离默认”判定） |
| `unknown` | 三处都查不到 |
| `removed` | `meta.removedIn <= 目标版本` → 「已在 X 移除」，给出 `renamedTo` |
| `newer` | `meta.introducedIn > 目标版本` → 「该版本不支持」 |
| `duplicate` | 同名出现多次（`save` 等可累加项除外） |

归一化：去首尾空白、压缩连续空白、去包裹引号、`yes/no` 大小写不敏感；内存类把
`1gb`/`1024mb` 折算成字节比较；enum 值小写比较。

**生效值**：`effective = 显式值 ?? 字典默认值`。风险规则和“重要项缺失”都用生效值判定，
并在 UI 上标明来源（`显式` / `默认`）。

摘要计数：已改 / 未知 / 已移除 / 告警 / 重复 / 重要项缺失。
重要项缺失只看固定清单（`maxmemory`、`maxmemory-policy`、`appendonly`、`save`、
`protected-mode`、`bind`）中用户完全没写的项，只提示不判错。

### 6.5 风险规则（v1 固定 10 条左右）

`src/data/risk-rules.json`，每条 `{ id, level, when, message }`；`when` 由分析器内少量
判定函数实现（不引入表达式引擎），输入是生效值映射：

- `protected-mode no` 且无密码、无 ACL 用户 → 高危。
- `bind 0.0.0.0` / `*` / `-::*` 且 `protected-mode yes` → 中危：公网暴露风险。
- `appendonly no` 且 `save ""` → 高危：无任何持久化。
- `maxmemory 0` 且 `maxmemory-policy` 非 `noeviction` → 中危：淘汰策略不生效。
- `maxmemory` 非 0 且 `maxmemory-policy noeviction` → 中危：写满即报错。
- `appendfsync always` → 提示性能影响。
- `daemonize yes` 且 `logfile ""` → 提示容器内无日志可查。
- `replica-read-only no` → 中危。
- `cluster-enabled yes` 但未写 `cluster-config-file` → 提示需按集群方式部署。
- `requirepass` 非空且长度 < 12 → 低危。

### 6.6 界面与密码处理

```
┌ 顶部栏：版本[7.4▾] 内联注释[关闭▾] 中文摘要 搜索 清空 载入官方配置 上传 导出▾ ┐
├─────────────────────────────┬──────────────────────────────────────────────────────┤
│ 你的配置  2326 行 · 已改 5   │ 官方完整配置 · 7.4.12 · 只读                          │
│  1 # Redis configuration…   │  1 # Redis configuration file example.               │
│  2                           │  2                                                    │
│ 88 bind 0.0.0.0        ●已改 │ 88 bind 127.0.0.1 -::1          ← 光标同步定位          │
│ …                            │ …                                                    │
├─────────────────────────────┴──────────────────────────────────────────────────────┤
│ [体检结果] [配置对比] [配置项说明]                                                   │
│ 筛选 [全部▾]  共 6 项                                                    │
│ 告警 1 · 缺失 4 · 已改 5                                                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

交互要点：
- 导入文件时自动去掉注释行与空行，按官方 `redis.conf` 里配置项出现的顺序重排，无法识别的行排在末尾，并在提示条里说明去掉了多少行注释。
- 左栏可编辑；右栏只读展示当前版本官方 `redis.conf` 全文，改动项在右栏对应行淡黄底；当前指令的指令行紫底高亮，其上方注释块也一并浅色高亮。
- 下方 tab 为「体检结果」「配置对比」「配置项说明」，默认选中体检结果；体检结果承载原摘要条的
  分类计数与可定位明细，详见[体检结果面板设计](2026-11-18-checkup-panel-design.md)。
- 「内联注释」同时作用于两栏：左栏三档（只补缺失 / 全部显示 / 关闭），右栏只在官方 conf 自身缺注释时补；块内展示官方注释与默认值，可展开，左栏块内可「写入配置」把注释固化到文本。收起态的摘要用「作用 · 默认值：X」，作用取自中文摘要，无摘要时回退「官方注释 · 默认值：X」；摘要只影响展示，块内正文与写入文本仍是官方英文注释加 `默认值:` 行。
- 编辑器标题右侧给出行颜色说明：白=默认值、黄=已改、红=未知/重复、灰=已移除、紫=版本不支持、蓝=注释块。
- 「只看差异」位于「配置对比」页头，同时过滤编辑器、内联注释与对比表；过滤后为空时给出「与默认值一致」文案。
- 「载入官方配置」把当前版本官方 conf 全文载入左栏（保留注释，作为基线）；空状态与工具栏都有这个入口。
- 空状态：一句引导 + 「载入官方完整配置」/「选择文件」。
- 体检页工具栏末尾、导出按钮右侧有一个竖线分隔的 GitHub 图标，生成向导页头在「返回体检」右侧放同一个入口，均在新窗口打开仓库首页。
- 支持拖拽文件到页面（文本，上限 2 MB）。
- 最小宽度 1024px，不做移动端适配。

**密码占位符**
- 导入/粘贴时，`sensitive` 指令（`requirepass`、`masterauth`、`tls-key-file-pass`、
  `tls-client-key-file-pass`、`user ... >pass`）的值在文本里就地替换成占位符
  `${env_requirepass}`、`${env_masterauth}` 等；替换前的原值只保存在内存里的
  `Map<行号, 原值>`，刷新页面即丢弃。
- 因此编辑器里看到的、`localStorage` 存的、默认导出的，都是占位符。
- 页面需明确提示：**Redis 原生不解析环境变量**，占位符要靠部署侧
  （docker-entrypoint、envsubst、confd 等）替换，否则实例会带着字面量启动。
- 占位符替换在导入时执行一次，之后用户可以在编辑器里改回任意内容。

### 6.7 导出

均为 `.conf` 文本下载，文件名 `redis-<原文件名或redis>-edited.conf`：

1. **原样导出**（默认）：保持原有行序、注释、空行；密码项保持占位符。
2. **补全注释导出**：在第 1 种基础上，对「已识别且其上方没有连续注释块」的指令行插入
   官方注释与 `# 默认值: X`，文案与页面上的内联注释完全一致。已有注释的指令不插入。
3. **还原密码导出**：把占位符换回本次会话内存中的原值，仅当原值仍在时可用，需二次确认。

导出前若存在「未知项」「该版本不支持」项，弹一次确认，不阻止导出。
导出面板里用三行文字说明每种导出的差异，尤其是「原样导出里密码是占位符」。
导出内容一律用 LF 换行。

### 6.8 部署

`npm run build` 产出静态文件：
- 托管：任意静态托管（GitHub Pages / Nginx / 对象存储），无需服务端。
- 运行方式：产物是 ES module，`file://` 下无法加载，必须由静态服务器托管（`npm run preview`、Nginx、对象存储、GitHub Pages 均可）；`base: './'` 只用于让产物可整体部署到任意目录或子路径。
- 页面地址只能有一层：构建期把 `index.html` 复制成 `404.html`，供 GitHub Pages 直接打开 `/configurator` 时兜底。更深的地址（`/configurator/`、`/configurator/abc`）会让相对资源解析到 `/configurator/assets/…` 而 404，取舍与改法见[生成向导设计](2026-11-19-configurator-design.md)的「待处理」。

线上部署由 GitHub Actions 在发布 Release 时构建并发布该 tag，见
[GitHub Pages 自动部署设计](2026-11-19-github-pages-design.md)；本地构建与预览（`npm run dev`）
说明写进 README。

## 7. 目录结构

```
ZiLucidRedis/
  index.html  package.json  vite.config.ts  tsconfig.json  eslint.config.ts  README.md
  data/        versions.json（minor 线清单）、upstream/（lock.json 与各线上游原文）
  scripts/     Node 原生 TS：fetch-upstream.ts、build-dict.ts、lib/（releases 与两个解析器）
  src/
    App.tsx  Root.tsx     体检页与路由壳
    components/           工具栏、编辑器、官方面板、体检结果、对比、查找、搜索、导出控件
    components/configurator/  生成向导：步骤导航、字段、自由行、插图与完成页
    components/ui/        shadcn 生成的控件
    lib/                  纯函数层：解析、归一化、分析、风险、diff、体检、查找、导出、密码、配置生成
    hooks/                快捷键与按版本数据加载
    data/                 dict/、official/ 生成物与人工登记表
  tests/     Vitest 用例（纯函数、组件、构建断言）
  docs/      工程规范、设计文档与实施计划
```

## 8. 验证方式

- 构建脚本断言：每版本指令数 150–260、分节数 ≥ 8；关键 5 项默认值可解析；
  `null` 默认值全部登记在 `no-default.json`；十份字典的 `meta.json` 中
  `introducedIn` 不晚于 `removedIn`。
- 单测（Vitest）：
  - 解析器：引号、行内 `#`、模板占位行、`save 3600 1` 多参数、`rename-command`。
  - 分析器：默认/已改/未知/已移除/版本不支持/重复/别名；内存单位等价（`1gb` == `1024mb`）；
    生效值判定（不写 `maxmemory` 时按 0 参与风险规则）。
  - 导出：原样导出的逐行 diff 只改动目标行；补全注释不重复插入；占位符还原只在有原值时可用。
  - 内联注释：`只补缺失` 模式对已带注释的指令不再生成块；`全部` 模式每条生成一个；
    块内文本与「补全注释导出」产出的注释逐字一致。
  - 搜索与插入：搜 `maxmemory` 命中；对文件中没有的项，插入位置落在其官方分节末尾，
    且插入后该行状态为 `changed` 或 `default` 而不是 `unknown`。
  - 密码：`requirepass "abc"` 导入后文本变为 `${env_requirepass}`，内存 Map 有原值，
    `localStorage` 序列化结果中不含 `abc`。
- 真实 fixture：把 lock.json 中 7.4 线的官方 `redis.conf` 原文贴入，应为 0 未知、
  0 已移除、0 已改（`requirepass` 的占位符替换不计）。
- 浏览器冒烟：贴入示例 → 看摘要与详情 → 切换内联注释三档 → 用搜索插入一个未配置项 →
  改一项 → 三种导出各验一次。另验 `npm run build` 后双击 `index.html` 能正常使用。

## 9. 留给实施者的决定

- CodeMirror 装饰与折叠的实现方式（StateField + Decoration 还是 ViewPlugin）。
- Tailwind 版本与主题（v1 先浅色）。
- 字典 JSON 的拆分粒度（是否按 section 再拆）——取决于实测体积。
- 构建脚本的缓存、重试与断点续跑细节。
- 40 条中文摘要的具体措辞（按官方注释意译，一句话）。
