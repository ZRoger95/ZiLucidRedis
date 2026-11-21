# 配置向导步骤骨架实施计划

状态：已实现 · 按当时的分批做法逐条记录，不回头改写正文。Task 2 的 `IncludesStep` 在 Task 3 泛化为 `RegionStep`；Task 3 起的 `PILOT_SECTIONS` 试点名单与旧骨架 `SectionStep`、右栏 `FigurePanel` 在 Task 13 收口时删除。当前行为以 [设计文档](../specs/2026-11-20-configurator-step-skeleton-design.md) 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 把 `/configurator` 每一步换成「header + mdxcn 说明区 + 操作区」的三段式骨架，让每个区域先讲清官方语义再做填空，覆盖版本步、全部区域步、「其他」步与完成页。

**Architecture:** 只动呈现层。`StepHeader` 承载 header（crumb / 中文标题 / summary / 小尺寸 hairline 插图 / 虚线），说明内容由 `regionIntros.tsx` 按区域 id 登记为 ReactNode（`Annotate` 编号注释 + `Callout` 警告），字段步走 rail 变体（字段网格 + sticky 说明栏，容器查询决定列数），操作区沿用既有 `DirectiveField` / `FreeLinesEditor`。`src/lib/configurator.ts` 只修 `sectionComment` 的整区取文。试点期用 `PILOT_SECTIONS` 名单控制铺开范围，未进入名单的步骤保持旧骨架。

**Tech Stack:** React 19、TypeScript strict、Tailwind 4 容器查询、shadcn（含 CLI 生成的 `tooltip`）、mdxcn 拷入源码（`callout` / `annotate` / `graph-flow` / `graph-frame` / `graph-arrow`）、`motion`、`@lucasmarkes/hairline`、Vitest + Testing Library。

**Spec:** [2026-11-20-configurator-step-skeleton-design.md](../specs/2026-11-20-configurator-step-skeleton-design.md)（前置：[2026-11-19-configurator-design.md](../specs/2026-11-19-configurator-design.md)）

## Global Constraints

- 纯前端、运行时零外部请求：mdxcn 走拷源码，不装 MDX 运行时，不引 CDN。
- 不改 `buildSteps` / `renderConfig` / 草稿与敏感值策略 / 路由；不改字典生成脚本与生成物。
- 界面文案中文，按最小宽度 1024px 的桌面端设计，不做移动端适配。
- shadcn 控件只从 `@/components/ui/*` 子路径导入；新控件用 `npx shadcn@latest add <name>` 生成并提交，不自造键盘与 ARIA 行为。
- TypeScript strict，不新增 `any`；禁止直接使用 `useEffect` / `useLayoutEffect`。
- `npm run lint` 零告警；`eslint-disable` 必须写原因。
- 每批改动都要 `npm run check` + `npm run build` 全绿，并在浏览器实测首屏、计数联动与上一批的回归。
- 试点未认可前不铺开：未进入名单的步骤必须逐像素保持原样。
- 提交信息沿用 `feat:` / `fix:` / `docs:` / `test:` / `refactor:` 前缀（本计划期间改动按用户节奏暂不提交）。

## Review Focus

- 说明区不能把字段推出首屏：字段密集步必须验证 1440 与 1024 两档。
- 双列不能压出断词：rail 占位后字段区实际宽度随视口变化，容器查询是否真的生效。
- 说明内容不得编造官方语义：每条注释都要能在官方 conf 注释或 config.c 里找到依据。
- 官方英文原文折叠块不能被中文替换，也不能在第一条生效行处截断。
- 敏感值不落盘、计数联动、导出与带回体检页在新骨架下行为不变。
- 摘要钳制的「两行容量」估算是否对最窄双列成立；Tooltip 在未挂 Provider 的页面级测试里不炸。

---

### Task 1: 引入 mdxcn 图效组件与令牌，版本步试点

**Files:**
- Create: `src/components/callout.tsx`、`src/components/graph-flow.tsx`、`src/components/ui/graph-frame.tsx`、`src/components/ui/graph-arrow.tsx`、`src/components/ui/graph-markdown.ts`
- Create: `src/lib/graph-motion.ts`
- Modify: `package.json`（`motion`）、`src/index.css`（`--graph-accent` / `--graph-frame` / `--graph-muted`）
- Create: `src/components/configurator/StepHeader.tsx`、`src/components/configurator/figures.ts`
- Modify: `src/components/configurator/VersionStep.tsx`
- Test: `tests/configuratorPage.test.tsx`（版本步断言）

- [ ] 用 shadcn CLI 拷入 mdxcn 的 `callout` / `graph-flow` 与基座，整理导入路径与命名导入
- [ ] 令牌映射：`--graph-accent` 取向导强调色，`--graph-frame` / `--graph-muted` 由现有墨色与 muted 文本派生
- [ ] 抽 `StepHeader`（crumb / 蓝色标题 / summary / 小插图 / `graph-rule`）与 `figures.ts` 插图映射表
- [ ] 版本步改为三段式：header + `GraphFlow` 版本线（10 版本分两行，当前所选 accent）+ 补丁信息行 + 清空草稿 Callout + 原 `Select`
- [ ] 放弃竖排 `GraphTimeline`（把 `Select` 推出首屏）与单行 10 节点（1024 下溢出）
- [ ] `npm run check`、`npm run build`、浏览器验 1440 / 1024

### Task 2: 02 INCLUDES 试点

**Files:**
- Create: `src/components/configurator/IncludesStep.tsx`（Task 3 泛化后删除）
- Modify: `src/components/configurator/ConfiguratorPage.tsx`（`PILOT_SECTIONS` 名单 + 分流）
- Test: `tests/configuratorPage.test.tsx`（02 内容断言 + 试点边界断言）

- [ ] 官方两条 include 示例改成 `Annotate` 编号注释（加载顺序覆盖、通配符按字母序、空目录安全）
- [ ] `Callout` 承载 CONFIG REWRITE 不重写 include 与放置位置的取舍
- [ ] 官方英文原文保留为折叠块
- [ ] 边界断言：02 无右栏 `aside`，03 起仍是旧骨架 + 右栏插图

### Task 3: 泛化为 RegionStep + 说明内容登记表，接入 03 MODULES

**Files:**
- Create: `src/components/configurator/RegionStep.tsx`、`src/components/configurator/regionIntros.tsx`
- Delete: `src/components/configurator/IncludesStep.tsx`
- Modify: `ConfiguratorPage.tsx`（名单加入 MODULES）
- Test: `tests/configuratorPage.test.tsx`

- [ ] 把 02 的独立组件泛化成 `RegionStep`：header 取登记表，说明区取 `REGION_INTROS[step.id]`，操作区沿用字段网格与自由行编辑器
- [ ] 各区域说明内容集中在 `regionIntros.tsx` 登记，后续铺开只加这张表
- [ ] 03 MODULES 接入：加载失败即中止、参数透传两条注释 + 「模块自带指令不在字典里，需回体检页手写」警告
- [ ] 02 回归逐像素一致

### Task 4: 04 NETWORK——字段密集步的 rail 变体

**Files:**
- Modify: `RegionStep.tsx`（rail 布局 + `max-w-6xl` + 容器查询）、`DirectiveField.tsx`（字段头行 `flex-wrap`）
- Modify: `regionIntros.tsx`、`ConfiguratorPage.tsx`
- Test: `tests/configuratorPage.test.tsx`、`tests/directiveField.test.tsx`

- [ ] 说明区改放右侧常驻栏：`xl` 以上两列 + `sticky`，`xl` 以下落到字段下方
- [ ] 双列由容器查询驱动（`@container` + `@[50rem]:grid-cols-2`），不再按视口断点
- [ ] 字段头行整段换行，消除 `tcp-/keepalive`、`socket-mark-/id` 式断词
- [ ] NETWORK 说明：bind 回环与 `-` 前缀、`port 0`、backlog 受 somaxconn 约束 + 暴露警告
- [ ] 实测 1440 / 1280 / 1024 与 sticky、恢复默认、计数联动

### Task 5: 修 `sectionComment` 整区取文

**Files:**
- Modify: `src/lib/configurator.ts`
- Test: `tests/configurator.test.ts`（先补能复现的断言）

- [ ] 先写失败测试：NETWORK 说明须含生效行 `bind 127.0.0.1 -::1`、protected-mode、somaxconn、SO_KEEPALIVE、socket-mark-id 段，且不含下一区域横幅
- [ ] 改为取整区原文直到下一区域横幅；注释行去 `#`、生效行原样保留
- [ ] 确认旧骨架步骤同样受益（同一函数）

### Task 6: 摘要统一中文 + 钳制与 Tooltip

**Files:**
- Modify: `src/data/zh-notes.json`（76 → 233 条）、`DirectiveField.tsx`
- Create: `src/components/ui/tooltip.tsx`（CLI 生成，自带 Provider）
- Test: `tests/zhNotes.test.ts`（新建）、`tests/directiveField.test.tsx`

- [ ] 摘要取完整信息：中文登记优先，未登记才回退官方注释整段（去空行与悬空 `Example:`）
- [ ] 依据各指令最新版本的官方注释补齐 157 条中文摘要，实验性与不落盘类标注
- [ ] 超过两行容量 `line-clamp-2` + 省略号，hover / 聚焦 `Tooltip` 浮出全文
- [ ] 加覆盖测试锁住「每个版本每条指令都有非空中文摘要」
- [ ] 官方说明折叠块保持英文原文不动

### Task 7: 05 TLS/SSL

**Files:**
- Modify: `regionIntros.tsx`、`ConfiguratorPage.tsx`、`src/data/configurator.json`（如需补登记）
- Test: `tests/configuratorPage.test.tsx`

- [ ] 20 字段走 rail：tls-port 配合 port 0、tls-auth-clients 三态、私钥与口令不落盘、复制/总线默认明文
- [ ] 「不使用系统信任库、须显式配 CA」警告
- [ ] 敏感口令字段保持密码输入与「敏感值不保存」提示
- [ ] 04 回归无变化

### Task 8: 06–10（GENERAL / SNAPSHOTTING / REPLICATION / KEYS TRACKING / SECURITY）

**Files:**
- Modify: `regionIntros.tsx`、`ConfiguratorPage.tsx`、`index.html`（favicon）
- Test: `tests/configuratorPage.test.tsx`

- [ ] 逐区登记说明内容（save 叠加与 `save ""`、replicaof / masterauth 占位符、CLIENT TRACKING 失效表、rename-command 空串禁用等）与对应警告
- [ ] SECURITY 的 ACL 与 rename-command 自由行排在字段区下方
- [ ] 脚本测量 rail 内代码行零溢出；`save` 多行与 `requirepass` 联动、localStorage 无明文
- [ ] 顺手修 favicon 404：内联 SVG data-URI，新会话 console 0 error

### Task 9: 11–15（CLIENTS / MEMORY MANAGEMENT / LAZY FREEING / THREADED I/O / KERNEL OOM CONTROL）

**Files:**
- Modify: `regionIntros.tsx`、`ConfiguratorPage.tsx`
- Test: `tests/configuratorPage.test.tsx`

- [ ] 逐区登记：ulimit 约束、maxmemory 与采样 / 主动过期力度、UNLINK 与 FLUSHALL ASYNC 命令示例、io-threads 与「命令执行仍串行」、oom-score-adj 三进程取值
- [ ] 边界断言扩展到 02–15，16 仍为旧骨架 + 右栏插图

### Task 10: 16–20（透明大页 / APPEND ONLY MODE / SHUTDOWN / 长阻塞命令 / REDIS CLUSTER）

**Files:**
- Modify: `regionIntros.tsx`、`ConfiguratorPage.tsx`
- Test: `tests/configuratorPage.test.tsx`

- [ ] 逐区登记：disable-thp 与 fork 尖峰、appendfsync 三档与重写期 fsync 取舍、SIGTERM 丢数据、SCRIPT KILL 与 busy-reply-threshold、nodes.conf 勿手改与 node-timeout 误判
- [ ] 边界断言扩展到 02–20，21 仍为旧骨架 + 右栏插图

### Task 11: 21–25（宣告 / SLOW LOG / LATENCY MONITOR / LATENCY TRACKING / EVENT NOTIFICATION）

**Files:**
- Modify: `regionIntros.tsx`、`ConfiguratorPage.tsx`
- Test: `tests/configuratorPage.test.tsx`

- [ ] 逐区登记：announce 只改报告不改监听、SLOWLOG GET 与保留条数、LATENCY LATEST / HISTORY、latency-tracking 与 INFO latencystats、notify-keyspace-events 标志组合
- [ ] 边界断言扩展到 02–25，26 仍为旧骨架 + 右栏插图

### Task 12: 26–29 与版本专属区域

**Files:**
- Modify: `regionIntros.tsx`（ADVANCED CONFIG / ACTIVE DEFRAGMENTATION / MISC / LUA SCRIPTING / GOPHER SERVER / BACKUP / RESTORE）
- Modify: `FinishStep.tsx`、`ConfiguratorPage.tsx`
- Test: `tests/configuratorPage.test.tsx`、`tests/finishStep.test.tsx`

- [ ] 26 高级参数（25–36 字段）与 27 主动碎片整理走 rail，登记调优与「没碎片问题别开启」的取舍
- [ ] 28「其他」（`MISC`）：说明本区是 config.c 有、官方模板未收录的指令，多为实验或调试用途，不确定就留空
- [ ] 29 完成页改三段式：`StepHeader`（`__finish__`）+ 改动统计 + 「落地检查」Annotate + 占位符提示 Callout（含明文密码时追加警告）+ 预览与操作
- [ ] 6.2 的 LUA SCRIPTING / GOPHER SERVER、8.10 的 BACKUP / RESTORE 同样登记说明内容

### Task 13: 铺开收口

**Files:**
- Modify: `ConfiguratorPage.tsx`（删 `PILOT_SECTIONS` 分流）
- Delete: `SectionStep.tsx`、`FigurePanel.tsx`
- Test: `tests/configuratorPage.test.tsx`、`tests/configuratorFigures.test.ts`、`tests/configuratorData.test.ts`

- [ ] 删除试点名单：`section` 与 `extra` 步骤一律走 `RegionStep`
- [ ] 删除 `SectionStep` 与右栏 `FigurePanel`，插图只经 `StepHeader` 呈现
- [ ] 边界断言改为「所有步骤都不渲染右栏 `aside`」，插图测试去掉面板渲染
- [ ] 加「每个区域 id 与 `MISC` 都登记了说明区内容」的覆盖断言，防止未来新增区域静默空白
- [ ] `npm run check` + `npm run build` 全绿；浏览器走完 26–29 并抽查 04 / 10 回归
- [ ] 更新 11-19 spec 的 §5.6 / §5.8：细节移交本设计文档，只留链接
