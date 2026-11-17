# shadcn/ui 迁移设计

日期：2026-11-17
状态：已实现
范围：阶段一只做「UI 组件库替换 + Tailwind 全量落地」；diff 的行为层重做留到阶段二。

## 1. 意图：为什么做

当前界面的交互控件来自 `@ui-sdk/react`（beta），它只提供行为、不提供样式，项目因此维护了约 830 行手写 CSS，包括对 ui-sdk 内部 `data-slot` 的覆写。用户希望改用 shadcn/ui：组件代码直接落到仓库里，样式基于 Tailwind 原子类，组件形态是社区最常见的一套，后续维护者不需要先理解 ui-sdk 的 primitive 模型。

两个库同属 Vercel 生态：ui-sdk 提供行为层（键盘、焦点、ARIA），shadcn 提供 Radix 行为 + 样式。因此这次替换是 1:1 的控件迁移，不是两套设计语言的对撞。

## 2. 目标

- 所有标准控件（按钮、下拉、开关、菜单、弹窗、搜索面板、Tabs）改用 shadcn/ui。
- 引入 Tailwind CSS v4，并把现有布局样式全量改成原子类，`index.css` 只保留令牌、base 与 CodeMirror 无法用原子类覆盖的部分。
- 移除 `@ui-sdk/core`、`@ui-sdk/react`、`@layer ui-sdk` 与 `@ui-sdk/core/web.css`。
- 视觉与信息密度保持现状：布局结构、面板尺寸、字号 13px、1024px 最小宽度、配色语义不变；控件的形态（圆角、按钮填充、遮罩色）采用 shadcn 默认风格。
- `npm run check` 与 `npm run build` 通过。

## 3. 非目标 / 反目标

非目标（本次不做）：

- 不做 diff 的行为层改造；`DiffView` 的行导航、选中态、方向键留到阶段二用 ui-sdk primitive 重做。
- 不做暗色模式，`color-scheme` 继续固定为 light。
- 不做移动端适配。
- 不改任何 `src/lib/` 纯函数、数据生成脚本与字典内容。
- 不引入新的状态管理、路由或请求层。

反目标（做了也算失败）：

- 布局结构与信息密度出现明显变化：面板比例、行高、字号、间距与现在不一致。
- 语义色错位：改过、未知、已移除、版本不支持等状态色在两处界面里不一致。
- 迁移后某个控件的键盘行为退化：Esc 关闭、方向键切换、Enter 选中、焦点回到触发器。
- 运行阶段出现对外请求，或产物不能在静态服务器离线使用。
- 为了通过 lint 大面积添加 `eslint-disable`，或放宽既有硬规则。

## 4. 已选方案

对话中确认：**B —— 控件替换 + 布局全量 Tailwind 化**。

| 方案 | 说明 | 结论 |
|---|---|---|
| A | 只替换控件层，保留现有布局 CSS | 放弃：Tailwind 只覆盖控件，项目长期维持两套样式写法 |
| B | 控件替换，同时把布局 CSS 全量改为原子类 | 采用 |
| C | 先换简单控件，Tabs/Command 继续用 ui-sdk | 放弃：两套库并存，`@layer` 顺序与焦点管理都要额外处理 |

两阶段拆分：阶段一完成 B 并移除 ui-sdk；阶段二单独为 `DiffView` 引入 `@ui-sdk/core` 重做行行为。阶段二不在本文范围内，但阶段一不得为它预留半套抽象。

视觉基准：对话中确认 **A —— 采用 shadcn 默认控件形态**。按钮、圆角、遮罩、菜单、弹窗按 shadcn 默认观感实现，只把字号固定为 13px、色板继续用项目现有语义色；布局尺寸与信息密度不动。因此不再逐项复刻 `web.css` 的 32px 控件高度、0 圆角与白色遮罩。

## 5. 依赖与配置

新增：

- 运行时：`radix-ui`、`class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-react`、`cmdk`（由 shadcn 的 command 引入）。
- 构建期：`tailwindcss`、`@tailwindcss/vite`、`tw-animate-css`。

移除：`@ui-sdk/core`、`@ui-sdk/react`。

配置文件：

- `components.json`：`tsx: true`、`rsc: false`、`tailwind.css: src/index.css`、`baseColor: neutral`、`cssVariables: true`；别名 `ui → @/components/ui`、`utils → @/lib/utils`、`hooks → @/hooks`、`lib → @/lib`。
- [tsconfig.json](../../../tsconfig.json)：补 `baseUrl: "."` 与 `paths: { "@/*": ["./src/*"] }`。项目只有一个 tsconfig，不需要拆 `tsconfig.app.json`。
- [vite.config.ts](../../../vite.config.ts)：`plugins: [react(), tailwindcss()]`，`resolve.alias` 把 `@` 指向 `src`；保留 `base: './'` 与测试配置。
- [eslint.config.ts](../../../eslint.config.ts)：忽略 `src/components/ui/**` 的格式类告警不现实，统一跑 `lint:fix`；只为新增的快捷键 hook 增加 effect 允许清单项。

shadcn 组件通过 CLI 生成后提交进仓库，属于源码而非黑盒依赖；这是“零外部请求”约束的落点。

## 6. 设计令牌与样式分层

`src/index.css` 结构改为：

1. `@import "tailwindcss";` 与 `@import "tw-animate-css";`。
2. `:root`：保留现有语义色（`--ink`、`--muted`、`--line`、`--panel`、`--changed`、`--unknown`、`--removed`、`--newer`、`--warning`、`--ok`），把 shadcn 的 `--background`、`--foreground`、`--border`、`--primary`、`--muted-foreground`、`--ring` 等映射到它们，避免出现第二套配色。
3. `@theme inline`：把语义色注册为 Tailwind 颜色，例如 `--color-changed`，从而可以使用 `text-changed`、`bg-changed`；字体用 `--font-sans`、`--font-mono` 替代 `--ui-font-sans`、`--ui-font-mono`。
4. `@layer base`：`html/body/#root` 高度、`body` 字体与底色、`color-scheme: light`。
5. 少量无法用原子类表达的规则：CodeMirror 装饰（`cm-status-*`、`cm-hide-line`）与注释块（`.annotation*`）。这部分 DOM 由 CodeMirror 的 `WidgetType` 和 `Decoration` 生成，保留普通 CSS，并移到 `src/components/editor.css`，由 `Editor.tsx` 引入。
6. 基础元素补齐：删除 web.css 后，`a` 的下划线与 `code` 的内联底色/圆角/等宽字体不再有默认值，必须在 `@layer base` 或使用处显式给出，否则 `EmptyState`、`DetailPanel` 里的 `<code>` 会退回纯文本外观。

`@layer ui-sdk;` 与 `@import '@ui-sdk/core/web.css';` 删除。除上述 CodeMirror 部分外，不再新增手写选择器。

## 7. 组件映射

| 现有用法 | shadcn 目标 | 备注 |
|---|---|---|
| `@ui-sdk/react/button` | `@/components/ui/button` | 用 shadcn 默认 variant：主要动作用 `default`，次要动作用 `outline` / `ghost`，不自定义高度与圆角 |
| `Select` + `SelectTrigger` + `SelectContent` | `select`（Radix Select） | 补 `SelectItem`，`onValueChange` 签名不变 |
| `Switch` + `SwitchThumb` | `switch` | 去掉 `SwitchThumb`，尺寸用 `size` 与类名控制 |
| `Menu` + `MenuItem` + `MenuSeparator` | `dropdown-menu` | `onAction` 改 `onSelect`；禁用项用 `disabled` |
| `Dialog` + `DialogBackdrop` + `Command` | `dialog` + `command` | `DialogContent` 自带遮罩与关闭按钮；`Command` 使用 `shouldFilter={false}`，搜索仍由 `searchDirectives` 负责 |
| `Tabs` + `TabsList` + `TabsTab` + `TabsPanel` | `tabs`（Radix Tabs） | `data-slot` 选择器删除；选中态用 `data-[state=active]` 变体 |
| `useShortcut('mod+k')` | `src/hooks/useShortcut.ts` | 只支持 `mod+k` 一个组合。现有实现允许带 Command/Control 的组合键在输入框内触发，新 hook 保持该行为：`metaKey \|\| ctrlKey` 成立即触发并 `preventDefault`，不判断焦点元素 |

`App.tsx` 的 Tabs 折叠逻辑保留：折叠时用条件类名隐藏 `TabsContent` 并收缩高度，不改成卸载，避免 CodeMirror 以外的面板状态丢失。

## 8. 布局迁移明细

以下类名逐一改为原子类，行为不变：

- `app` / `topbar` / `control` / `spacer` / `footnote`
- `summary` 及其状态色（`danger`、`warn`）
- `banner`、`workspace`、`pane`、`pane-official`、`pane-head`、`pane-hint`、`editor-host`
- `bottom`、`bottom-head`、`tab-panel`、`is-collapsed`
- `detail*`、`compare-*`、`badge*`、`empty`
- `official*`（含 `is-highlight`、`is-context`、`is-focus`）、`official-annotation`
- `diff*`（含 `is-default`、`is-changed`、`is-added`、`is-removed`、`is-unknown`、`is-newer`、`is-duplicate`、`is-special`、`diff-token`、`diff-risk`、`diff-note`、`diff-collapse`）
- `palette-dialog`、`palette-list`、`palette-*`

diff 的左右单元格底色依赖“行 + 方向”的组合，改成在 JSX 里按 `row.kind` 与 `left/right` 计算类名，不再写后代选择器。

## 9. 规则与文档同步

- [AGENTS.md](../../../AGENTS.md)：删除「不引入 Tailwind」「先读 ui-sdk skill」「只从 @ui-sdk/react 子路径导入」「样式入口保持 `@layer ui-sdk`」四条；替换为 shadcn 与 Tailwind 规则：UI 改动先读 `node_modules/shadcn` 不可行，改为读 `components.json` 与已落库的 `src/components/ui/*`；新控件从 `@/components/ui/*` 组合，不自造 `role=` 控件；样式用 Tailwind，CodeMirror 装饰例外。
- `src/lib/` 仍是纯函数层，`utils.ts` 的 `cn` 属于无副作用工具，允许放在 `src/lib/`。
- `.agents/skills/ui-sdk/` 保留，仅服务于阶段二的 diff 行为层；在 AGENTS.md 中写明适用范围。
- [docs/superpowers/plans/2026-11-17-v2-diff-experience.md](../../../docs/superpowers/plans/2026-11-17-v2-diff-experience.md) 的技术栈一行更新，避免继续指向已移除的 ui-sdk 控件。
- [docs/engineering/eslint.md](../../engineering/eslint.md) 中「可访问性交给 ui-sdk 组件」的现状描述改为 shadcn/Radix。
- [docs/superpowers/specs/2026-11-16-redis-conf-doctor-design.md](2026-11-16-redis-conf-doctor-design.md) 的现状描述同步为当前技术栈。

## 10. 代码改动清单

- 新增：`components.json`、`src/components/ui/*`、`src/lib/utils.ts`、`src/hooks/useShortcut.ts`、`src/components/editor.css`。
- 修改：`package.json`、`vite.config.ts`、`tsconfig.json`、`src/index.css`、`src/App.tsx`、`src/components/Toolbar.tsx`、`ExportMenu.tsx`、`SearchPalette.tsx`、`DetailPanel.tsx`、`EmptyState.tsx`、`DiffView.tsx`、`OfficialPane.tsx`、`Editor.tsx`、`SummaryBar.tsx`、`eslint.config.ts`、`AGENTS.md`。
- 删除：`@ui-sdk/*` 依赖；`src/index.css` 中的 ui-sdk 引入与全部已迁移选择器。

## 11. 测试与验证

- `npm run check`（lint + format:check + typecheck + test）与 `npm run build` 必须通过。
- 新增 `tests/useShortcut.test.ts`：`mod+k` 触发回调；在输入框内触发；带 `shift` 或单独 `k` 不触发。
- 新增控件层 RTL 用例：`SearchPalette` 输入后筛选并回车插入、`ExportMenu` 在无可还原密码时禁用第三项。Radix 在 jsdom 下需要的 `ResizeObserver`、`hasPointerCapture`、`scrollIntoView` shim 补进 `tests/setup.ts`。
- 既有 `src/lib/` 测试不改，作为行为未变的回归基线。
- 手动清单（1024px 窗口）：版本下拉键盘操作、内联注释下拉、两个开关、导出菜单三项与禁用态、Cmd/Ctrl+K 搜索并插入、Tabs 切换与折叠、编辑器状态底色与注释块写入、官方面板定位高亮、diff 跳转与“改回默认值”、拖拽导入与清空。

## 12. 风险

- 无截图回归测试，视觉走查只能靠手动清单；迁移期间只换控件形态，不调整布局尺寸、间距与字号，避免布局层回归。
- shadcn 组件由 CLI 生成，不同版本生成结果不同；生成后立即提交并以此作为基线，后续升级单独进行。允许直接修改生成物以贴合项目观感——这是 shadcn 的预期用法，调用处不再堆叠 override。
- Tailwind v4 的 `@theme` 与 `@custom-variant` 语法与 v3 资料不通用，实施时以本地安装版本的文档为准。
- cmdk 自带过滤，必须确认 `shouldFilter={false}`，否则与 `searchDirectives` 的双重过滤会导致空结果。
- Radix 弹层走 Portal，现有 CSS 里依赖父级选择器的规则（如 `.bottom` 下的 Tabs）需要改为组件自身的 `className`。

## 13. 留给实施者的决定

- 语义色到 shadcn 令牌的具体映射值（例如 `--primary` 用中性深色还是品牌色），以现有观感为准，不新造颜色。
- `badge` 是否额外用 shadcn 的 `badge` 组件替换 `.badge`；若替换，状态色通过 `variant` 之外的类名保留。
- `editor.css` 是否并入 `index.css`；拆分的理由是 CodeMirror 与注释块样式不属于 Tailwind 管辖。
