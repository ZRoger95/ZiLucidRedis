# 配置向导步骤骨架（header + mdxcn 说明区）设计

日期：2026-11-20
状态：已实现
范围：`/configurator` 每一步的呈现骨架与说明内容，以及支撑它的摘要与官方原文取文。不改路由、数据模型、输出算法、草稿与敏感值策略，也不改体检页。向导的整体设计见 [2026-11-19-configurator-design.md](2026-11-19-configurator-design.md)。

## 1. 意图：为什么做

旧呈现是「表单 + 右栏一张装饰插图」：区域步只有英文标题加一行中文摘要，用户面对的仍是几十条指令的填空；右侧 hairline 插图面板与整体不协调，也不承载任何信息。

参考截图给出的目标是博客式阅读顺序：**先讲清这个区域在官方 redis.conf 里意味着什么，再做填空**。官方 conf 的注释里本来就有可操作的语义（`-` 前缀的含义、`save ""` 关快照、backlog 受 somaxconn 约束），把这些抽成编号注释放在字段旁边，比让用户去读折叠的英文原文有效得多。

## 2. 改动前的现状

- 区域步由 `SectionStep` 承载：等宽英文标题 + `中文名 · summary` 一行 + 官方注释折叠块 + 字段网格；右侧 `FigurePanel` 渲染一张大插图加一句 summary。
- 版本步只有一个 `Select`；完成页只有改动数、预览与按钮。
- 字段摘要取官方注释的第一行（`doc.comment[0]`），长句拦腰断；`src/data/zh-notes.json` 只登记 76 条，其余指令回退英文原文。
- `sectionComment` 扫到第一条**非注释行**就 `break`，NETWORK 这类中间夹着生效行的区域，折叠说明只剩开头一段。
- 项目只有 shadcn 控件，没有任何图效组件。

## 3. 目标

- 每步统一三段式：**header**（等宽 crumb、蓝色粗体标题、一句 summary、右侧小尺寸插图、`graph-rule` 虚线分隔）→ **说明区**（数据驱动的图效组件承载本区语义与警告）→ **操作区**（原有控件与行为不变）。
- 覆盖全部步骤：版本步、26 个区域步、「其他」（`MISC`）步、完成页，含版本专属区域 6.2 的 LUA SCRIPTING / GOPHER SERVER 与 8.10 的 BACKUP / RESTORE。
- 字段密集步：字段与说明同屏，**首屏优先给字段**。
- 字段摘要统一中文且不截断，超长时钳制并 hover / 聚焦浮出全文。
- 官方英文原文继续可查，保持原文不翻译。

## 4. 非目标 / 反目标

非目标（本次不做）：

- 改 `buildSteps` / `renderConfig` / 草稿持久化 / 路由；改任何字典生成脚本。
- 引入 MDX 运行时或 `.mdx` 文件；把 mdxcn 当步骤条或导航。
- 替换 shadcn 控件；自造键盘与 ARIA 行为。
- 移动端适配；深色模式。
- 推荐配置；场景预设已由 [单机单实例场景预设设计](2026-11-26-configurator-scenario-single-design.md) 实现。

反目标（做了也算失败）：

- 说明区把字段推出首屏，或为了图效牺牲可读性（列宽断词、代码行溢出）。
- 编造官方语义：说明内容必须能从官方 conf 注释或 config.c 语义核对。
- 用中文说明替换掉官方英文原文折叠块。
- 为图效引入运行时网络请求或 CDN 资源。

## 5. 方案

已选：**mdxcn 组件经 shadcn CLI 拷源码引入，用数据 props 驱动，不引 MDX 运行时**。

放弃的方案：

- **装 mdxcn 的 npm 包 / 引 MDX 运行时**：要背一套编译器与内容格式，而本项目所有说明都是构建期已知的静态内容，数据 props 足够。
- **手写同类图效**：省一个来源，但要重复实现框线、箭头、编号注释与动效语言，且与「新组件走 shadcn CLI 生成并提交」的项目习惯不符。
- **一次改完所有步骤的骨架**：骨架统一更协调，但试点未认可前铺开会让 20 多个区域步承担返工风险；改为按批推进（01 → 02 → 03 → 04 → 05 → 每批 5 步 → 26–29），代价是两种布局短暂并存，收口时删除。
- **竖排 `GraphTimeline` 版本线**：信息更全（逐行补丁日期），但 10 行把版本 `Select` 推出首屏；改用横排 `GraphFlow` 两行 + 所选补丁信息行。单行 10 节点在 1024px 下会溢出，故分两行。

### 5.1 三段式骨架

- header 的 markup 抽为 [StepHeader.tsx](../../../src/components/configurator/StepHeader.tsx)，版本步、区域步、「其他」步与完成页共用；crumb 形如 `~/configurator · 04 · NETWORK`，标题取 `configurator.json` 的中文名，summary 取登记表。
- 插图从右侧大面板改为 header 右侧 `w-40` 小尺寸张，映射仍走登记表 `figure` 字段，由 [figures.ts](../../../src/components/configurator/figures.ts) 提供；`--hairline-plate` 设为 header 底色。
- 说明区内容按区域登记在 [regionIntros.tsx](../../../src/components/configurator/regionIntros.tsx)（`REGION_INTROS: Record<string, ReactNode>`），完成页与版本步的内容直接写在各自组件里。

### 5.2 说明区的两种布局

- **竖排**（无字段的自由行步，如 INCLUDES / MODULES）：header → 说明区 → 操作区，说明在前不打扰任何输入。
- **rail**（有字段的区域步、「其他」步）：header 通栏，`xl` 以上「字段网格 | 20rem 说明栏」两列，说明栏 `sticky` 跟随滚动；`xl` 以下说明栏落到字段下方，字段优先。字段区容器加宽到 `max-w-6xl` 补偿说明栏占位。
- 字段网格双列由**容器查询**驱动（字段区 `@container` + `@[50rem]:grid-cols-2`）：视口断点不知道说明栏占了多少宽度，按视口开双列会把列压到断词。
- [DirectiveField.tsx](../../../src/components/configurator/DirectiveField.tsx) 的字段头行为 `flex-wrap` + 各段 `whitespace-nowrap`：放不下时整段换行，不拦腰断指令名。该修复对所有步骤生效。

### 5.3 说明内容组件

- `Annotate`（编号注释）承载官方示例语义：`code` 每行行尾用 `# (n)` 标记，`notes` 逐条讲可操作结论；标记行保持高亮，其余退到 muted。
- `Callout` 承载本区的取舍与风险，`type="warning"` 用于「不改会踩坑」，`type="note"` 用于「改了要知道什么」。
- `GraphFlow` 只用于版本步的版本线。
- 拷入源码按项目门禁整理：`graph-markdown` 放 [src/components/ui/](../../../src/components/ui/graph-markdown.ts)（`src/lib` 禁 React 依赖），命名导入替代 namespace 导入，修正 CLI 写错的 `cn` 导入路径与别名。
- 令牌映射：`--graph-accent: #2563eb` 作为向导单一强调色（标题与图共用），`--graph-frame` / `--graph-muted` 由 `--ink` / `--muted-text` 派生，不引入 dark 块。

### 5.4 字段摘要

- 摘要取完整信息：`zh-notes.json` 登记的中文摘要优先，否则官方注释整段拼接（去空行与悬空 `Example:` 标题）——仅服务于未登记指令。
- `zh-notes.json` 覆盖全部 10 个版本的每条字典指令（76 条补到 233 条），依据该指令最新版本的官方注释撰写；实验性指令标注「实验性」，私钥口令类标注「不落盘」。
- 超过两行容量（按最窄双列估算的加权字符数）时 `line-clamp-2` 钳制加省略号，hover / 键盘聚焦由 shadcn `Tooltip` 浮出完整摘要；Tooltip 组件自带 Provider，页面级测试直接渲染不依赖应用层挂载。
- 官方说明折叠块保持英文原文，不受摘要语言统一影响（用户明确要求）。

### 5.5 官方原文整区取文

`sectionComment` 改为取整区原文直到下一区域横幅：注释行去 `#`，生效行原样保留（官方文里「the following bind directive」这类指代需要它在场）。这是既有缺陷，旧 `SectionStep` 同样受影响，只是字段密集步把它暴露出来；修复前先补能复现的断言。

### 5.6 铺开收口

试点期用 [ConfiguratorPage.tsx](../../../src/components/configurator/ConfiguratorPage.tsx) 的 `PILOT_SECTIONS` 名单分流。全部步骤认可后名单删除：`kind` 为 `section` 与 `extra` 的步骤一律走 `RegionStep`，`SectionStep` 与右栏 `FigurePanel` 删除，完成页改用 `StepHeader` + 说明区 + 操作区。

### 5.7 附带修复

全站唯一的 console error 是 `favicon.ico` 404：[index.html](../../../index.html) 改为内联 SVG data-URI 图标（蓝底 R，与强调色同源），不新增静态文件请求。

## 6. 约束与风险

- **产物体积**：新增 `motion` 依赖与拷入的 mdxcn 源码；hairline 仍只 import 登记表用到的张数。运行时零外部请求不变。
- **宽度**：设计基线仍是最小 1024px。1024–1279 说明栏落到字段下方，字段单列；`xl` 起两列 + sticky rail。
- **内容维护**：新增区域或上游新增指令时，`tests/configuratorData.test.ts` 会断言每个区域 id 与 `MISC` 都登记了说明内容，`tests/zhNotes.test.ts` 断言每条指令都有中文摘要——漏登记会报警而不是静默回退。
- **动效**：`motion` 组件尊重 `useReducedMotion`，滚动入场只作用于说明区，不影响表单操作。

## 7. 验收

- 每一步（版本步、26 个区域步、「其他」步、完成页）都有 header 三段与说明区；版本专属区域 LUA SCRIPTING / GOPHER SERVER / BACKUP / RESTORE 同样有内容。
- 字段密集步在 1440 宽下首屏同时出现字段网格与完整说明栏；滚到底说明栏仍在场；1024 宽下字段优先、无横向溢出、无断词。
- 任一字段摘要为中文；超长摘要钳制为两行且 hover / 聚焦能看到全文；官方说明折叠块展开后包含生效行与后续段落，直到下一区域横幅。
- 左侧导航与 footer 的改动计数、敏感值不落盘、导出与带回体检页的行为与 11-19 设计一致，未因骨架改动而变化。
- `npm run check` 与 `npm run build` 通过；`tests/configuratorPage.test.tsx` 断言所有步骤都不再渲染右栏 `aside`。
