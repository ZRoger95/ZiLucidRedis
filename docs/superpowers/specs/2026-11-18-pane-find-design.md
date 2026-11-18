# 左右栏内置查找设计

日期：2026-11-18
状态：已实现
范围：左栏「你的配置」与右栏「官方完整配置」各自内置一个 VS Code 风格查找条；不涉及替换、跨栏联合搜索与底部面板。

## 1. 意图：为什么做

配置文件动辄两千多行，右栏官方 conf 只读且没有行内搜索，浏览器自带 `Ctrl+F` 又会搜到工具栏、说明文字和底部面板，命中杂乱。用户需要像 VS Code 一样，在两栏中各自按 `Ctrl+F` / `⌘F` 就地查找，命中只落在当前栏的配置文本里，并支持区分大小写、全词与正则。

## 2. 现状

- 左栏是 CodeMirror 6 编辑器，`Editor` 通过 `Compartment` 重建行装饰；右栏 `OfficialPane` 把官方 conf 按行渲染成普通 DOM，只读。
- 快捷键只有 [useShortcut.ts](../../../src/hooks/useShortcut.ts) 的 `mod+k`，实现已同时接受 `metaKey` 与 `ctrlKey`，但没有拦截浏览器查找。
- 匹配、高亮、计数、导航在项目中都不存在；`src/lib` 没有查找相关纯函数。
- 左栏「只看差异」通过 `.cm-hide-line` 隐藏非差异行，隐藏行仍存在于文档中。

## 3. 目标

- 焦点/点击落在哪一栏，`Ctrl+F` / `⌘F` 就在哪一栏打开查找条；两栏状态互不影响。
- 查找条包含：输入框、`当前/总数` 计数、上一个、下一个、`Aa`、`ab|`、`.*`、关闭。
- 输入即高亮全部命中，当前命中用更强样式；`Enter` 下一个、`Shift+Enter` 上一个、两端循环；`Esc` 关闭并把焦点交回该栏内容。
- 正则无效时输入框标红并显示提示，不崩溃、不高亮。
- 右栏同样支持导航与自动滚动到当前命中。

## 4. 非目标 / 反目标

非目标（本次不做）：

- 查找并替换、全部选中、增量搜索历史。
- 一个查找条同时搜两栏，或两栏联动滚动。
- 搜索内联注释、底部体检/对比/说明面板、工具栏文案。
- 搜索高亮进入导出内容或持久化状态。
- 移动端适配。

反目标（做了也算失败）：

- 浏览器自带查找仍被触发，或 `mod+k` 搜索面板被破坏。
- 在查找框里输入会改动配置文本、抢走输入焦点或触发编辑器选区变化。
- 右栏查找需要把 `OfficialPane` 改成 CodeMirror。
- 为通过 lint 放宽 effect 或 React 依赖规则。

## 5. 已选方案

| 方案 | 说明 | 结论 |
|---|---|---|
| 1 | `src/lib/find.ts` 纯匹配引擎 + 共用 `FindWidget`；左栏用 CodeMirror 装饰，右栏用 `<mark>` | 采用 |
| 2 | 左栏接 `@codemirror/search`，右栏自研 | 放弃：默认面板观感与右栏对不齐，还要桥接 React 状态；右栏工作量不减，反而多一个依赖 |
| 3 | 右栏改为只读 CodeMirror 以复用官方搜索 | 放弃：需重写行渲染、注释块、高亮与聚焦逻辑，回归面远超查找本身 |

代价：高亮装饰、正则边界与循环导航自己维护。收益是两栏行为、观感、测试一致，且不新增运行时依赖。

## 6. 行为规格

### 6.1 入口与焦点

- 两栏最外层 `section` 监听 `pointerdown` 与 `focusin`，记录 `activePane`；默认 `editor`。
- `mod+f`：对 `activePane` 递增一个 `findRequest` 计数；对应栏收到新的计数后打开查找条并把焦点放到输入框、全选已有查询。
- 查找条已打开时再按 `mod+f`：只重新聚焦并全选，不重置查询。
- 焦点在底部面板时，`mod+f` 仍作用于最近一次激活的栏。

### 6.2 查找条

- 覆盖式悬浮在栏内右上角，不占布局；左、右两栏样式一致。
- 空查询：不高亮、不显示计数。
- 有查询无命中：显示 `0/0`；正则无效：显示「正则无效」且输入框标红。
- `Aa`、`ab|`、`.*` 为 `aria-pressed` 切换按钮，初始均关闭；`Alt+C` / `Alt+W` / `Alt+R` 切换（按 `event.code` 判断，兼容 macOS Option 输入）。
- `Enter` 下一个、`Shift+Enter` 上一个；无命中时不做任何跳转。
- 计数用 `aria-live="polite"` 播报。

### 6.3 匹配规则

- 默认大小写不敏感、非全词、非正则。
- 非正则模式对查询做字面转义；正则模式使用 JavaScript 正则语法（不是 PCRE）。
- 全词：命中前后字符均不属于 `\w` 才计入，正则模式下同样追加该过滤。
- 每次按键全量重算；查询、选项变化后当前命中回到第一处。
- 零宽正则命中计数但不高亮文本；实现必须推进 `lastIndex`，禁止死循环。

### 6.4 导航与高亮

- 全部命中：浅黄底；当前命中：更深的橙色底，左栏额外用选区定位。
- 下一个/上一个在命中集合内循环。
- 左栏跳转只更新选区与滚动位置，不调用 `focus()`，焦点留在输入框。
- 右栏按行切分命中片段渲染 `<mark>`；当前命中所属行滚动到可视区中部。

### 6.5 「只看差异」

- 左栏开启「只看差异」时，查找只统计当前可见行；被 `.cm-hide-line` 隐藏的行不参与计数与导航。可见性判断复用 `Editor` 内现有的 `quiet` 逻辑，抽成局部函数供装饰与查找共用。
- 右栏始终搜索全部官方行。

### 6.6 关闭与焦点

- `Esc` 或关闭按钮：隐藏查找条、清除高亮，保留查询与选项，下次打开沿用。
- 关闭后左栏焦点回到 CodeMirror；右栏把焦点交给行容器（`tabIndex={-1}`）。
- 关闭不修改配置文本、不改滚动以外的编辑状态。

## 7. 代码改动

- 新增 `src/lib/find.ts`：

```ts
export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
  lineNo: number;
}

export interface FindResult {
  matches: FindMatch[];
  error: boolean;
}

export const DEFAULT_FIND_OPTIONS: FindOptions;

export function findMatches(
  text: string,
  query: string,
  options: FindOptions,
  skipLines?: ReadonlySet<number>,
): FindResult;
```

- 新增 `src/components/FindWidget.tsx`：纯展示组件，无 effect，接收查询、选项、计数、当前序号、非法标记、`inputRef` 与各回调；键盘事件在本组件内处理。
- [Editor.tsx](../../../src/components/Editor.tsx)：持有查找状态；新增独立 `searchCompartment` 与 `.cm-find-match` / `.cm-find-current` 标记；当前命中变化时更新选区并滚动；接收 `findRequest`。
- [OfficialPane.tsx](../../../src/components/OfficialPane.tsx)：持有查找状态；行组件 `memo` 化，命中按 `Map<lineNo, FindMatch[]>` 下发，未命中行不重渲染；当前命中滚动；接收 `findRequest`。
- [App.tsx](../../../src/App.tsx)：`activePane` 与两栏 `findRequest` 计数；`mod+f` 路由；向两栏传计数与激活回调。
- [useShortcut.ts](../../../src/hooks/useShortcut.ts)：键位类型扩展为 `'mod+k' | 'mod+f'`。
- [editor.css](../../../src/components/editor.css)：新增两个查找高亮类。
- 新增 `src/components/ui/input.tsx`：用 `npx shadcn@latest add input` 生成，供查找条输入使用。
- [README.md](../../../README.md)：补一条 `Ctrl+F` / `⌘F` 的用法说明。
- 无需改动 [eslint.config.ts](../../../eslint.config.ts)：聚焦与滚动 effect 留在已在允许清单内的 `Editor` / `OfficialPane`，`FindWidget` 不使用 effect。

### 7.1 组件接口

```ts
// Editor / OfficialPane 新增
findRequest?: number;

// FindWidget
interface FindWidgetProps {
  open: boolean;
  query: string;
  options: FindOptions;
  matchCount: number;
  activeIndex: number; // -1 表示无当前命中
  invalid: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onOptionsChange: (next: FindOptions) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  label: string;
}
```

## 8. 测试与验证

- 新增 `tests/find.test.ts`：大小写、全词、正则、非法正则、空查询、特殊字符字面匹配、零宽匹配不死循环、`skipLines` 过滤、行列换算。
- 新增 `tests/findWidget.test.tsx`：计数渲染、`Enter` / `Shift+Enter` 回调、三个开关的 `aria-pressed` 与回调、非法正则提示、`Esc` 关闭。
- 新增 `tests/editorFind.test.tsx`：`mod+f` 打开并聚焦输入框；输入后出现 `.cm-find-match`；下一个改变选区且焦点仍在输入框；`Esc` 关闭并聚焦编辑器；「只看差异」下隐藏行不计数。
- 新增 `tests/officialPaneFind.test.tsx`：命中渲染为 `<mark>`；下一个滚动到对应行（mock `scrollIntoView`）；关闭后容器获得焦点。
- [app.test.tsx](../../../tests/app.test.tsx)：在右栏按下 `mod+f` 只打开右栏查找条；未操作过时默认左栏；`mod+k` 行为不变。
- `npm run check` 与 `npm run build` 必须通过。

## 9. 风险

- 右栏两千多行：若命中下发方式导致整列重渲染，输入会卡顿；必须以行级 `memo` + 稳定 props 控制，必要时在实现阶段用真实浏览器确认。
- jsdom 不实现 `scrollIntoView`，相关断言需要 mock。
- 正则语法差异：用户从 VS Code 复制的 PCRE 模式可能不兼容，界面文案不承诺 PCRE。
- 左栏查找选区与外部 `jumpTo` 共享选区通道，需避免打开查找时触发 `onCursorLine` 的额外副作用。

## 10. 留给实施者的决定

- 查找条的具体尺寸、图标与配色微调。
- 右栏行容器的可聚焦语义与 `aria-label` 文案。
- `mod+f` 在底部面板内按下时是否强制切回左栏（本设计暂定沿用最近激活栏）。
