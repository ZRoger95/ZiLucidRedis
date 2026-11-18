# diff 行导航行为层设计（阶段二）

日期：2026-11-18
状态：已实现
范围：只做「配置对比」的行级键盘导航；不涉及多选、复制与左右栏切换。

## 1. 意图：为什么做

阶段一把 UI 控件迁到 shadcn 后，`DiffView` 仍是手写交互：只有左侧可跳转行带 `tabIndex`，支持 Enter / Space。diff 最多两千多行，键盘用户要么反复 Tab，要么只能用鼠标点击，多行块之间的扫描成本高。

阶段二为 diff 行补上一套标准键盘导航：整组只占一个 Tab 停靠点，方向键在行间移动，Enter 跳转，Esc 把焦点送回编辑器。行为层用 ui-sdk 的 `createRovingFocus`，样式继续用 Tailwind，不重新引入 `web.css`。

## 2. 目标

- `↑` / `↓` 在当前可跳转的 diff 行之间移动焦点，`Home` / `End` 到首尾行。
- `Enter` 在编辑器中定位该行，焦点留在 diff 内，便于继续浏览。
- `Esc` 把焦点送回左侧 CodeMirror 编辑器。
- 整个 diff 行组在 Tab 序列里只占一个停靠点（roving tabindex）。
- 点击行为、diff 数据模型、折叠逻辑、改回默认值的箭头全部不变。
- ui-sdk 只用于 diff 行行为；标准控件继续使用 shadcn。

## 3. 非目标 / 反目标

非目标（本次不做）：

- 不做多选、区间选择、复制选中行。
- 不做 `PageUp` / `PageDown`、左右栏切换、跨列移动。
- 不实现完整的 `grid` / `table` ARIA 语义。
- 不改 diff 算法、折叠阈值、`onlyDiff` 逻辑与 `applyDefaultLine`。
- 不重新引入 `@ui-sdk/core/web.css`，不恢复 ui-sdk 的默认视觉。
- 不处理 Tabs 切换导致 `DiffView` 卸载的问题（阶段一已记录为接受的取舍）。

反目标（做了也算失败）：

- Tab 仍然逐个经过每一行，或整组出现多个 Tab 停靠点。
- `Enter` / 方向键触发页面滚动、触发行内“改回默认值”按钮、或把字符输入编辑器。
- diff 行获得焦点后无法用 `Esc` 回到编辑器。
- 为通过 lint 放宽既有规则，或给 `src/lib/` 引入 React 依赖。

## 4. 已选方案

| 方案 | 说明 | 结论 |
|---|---|---|
| A | `@ui-sdk/core` 的 `createRovingFocus` + `@ui-sdk/react/primitive` 的 `createParts`，封装一个 `diff-rows` primitive | 采用 |
| B | 手写 roving tabindex hook | 放弃：方向键、Home/End、焦点记忆与边界都要自己写，和阶段二“复用行为层”的初衷相反 |
| C | 用 shadcn Table 重构行结构，再加导航 | 放弃：Table 只提供视觉语义，导航仍要手写；行内已有按钮，改成单元格会扩大改动面 |

代价：`@ui-sdk/core` / `@ui-sdk/react` 重新进入依赖，且仍是 beta。只在 `diff-rows` 一个文件里使用，版本锁定，升级单独评估。

## 5. 行为规格

### 5.1 键位

| 按键 | 行为 |
|---|---|
| `Tab` | 进入行组，焦点落在最近一次聚焦的行；首次进入落在第一行 |
| `Shift+Tab` | 离开行组，回到上一个可聚焦元素 |
| `↑` / `↓` | 上一个 / 下一个可跳转行；到边界停止，不循环 |
| `Home` / `End` | 第一行 / 最后一行 |
| `Enter` | 跳到编辑器对应行，焦点保持在 diff |
| `Esc` | 焦点回到编辑器 |
| `Space` | 不再跳转；交给浏览器默认滚动 |

### 5.2 可聚焦范围

- 只有带左侧行号的 diff 行进入 roving 组（`lineNo > 0`）；只有右侧内容的 `added` 行跳过，与现有 `tabIndex={-1}` 一致。
- 行内“改回默认值”的 `»` 按钮仍是独立的原生 button，可通过 Tab 到达；它的 `Enter` 与方向键不冒泡到行，不触发行跳转；`Esc` 会冒泡到行，照样把焦点送回编辑器。
- 折叠行 `@@ 展开 N 行未修改 @@` 是普通按钮：它渲染在行组容器内，但不是 roving 行，不参与方向键导航，也不改变行组的 Tab 停靠点；它自己可单独 Tab 聚焦。

### 5.3 ARIA 与焦点

- 行容器 `role="group"`，`aria-label="配置对比行"`。
- 每个可聚焦行带 `aria-label`，说明左侧行号与指令名，例如“第 154 行，maxmemory”。
- 行本身不设 `role="option"` / `aria-selected`：本次没有“选中”概念，避免向读屏器承诺 listbox 语义。完整表格语义是非目标。

### 5.4 状态变化

- 切换 `onlyDiff`、展开折叠块、diff 重算后，roving 组按新的行集合重新检查，停靠点回到第一个可聚焦行。
- 焦点所在的行被移除时（例如在 `onlyDiff` 下按 `»` 把该行改回默认值），浏览器把焦点交回 `body`，用户需再按一次 `Tab` 重新进入行组。`createRovingFocus` 在部件卸载时不迁移焦点，本次接受该边界。
- `DiffView` 重新挂载（切换 Tabs 后返回）时，焦点状态允许重置。

## 6. 代码改动

- [package.json](../../../package.json)：新增 `@ui-sdk/core`、`@ui-sdk/react`，版本与阶段一移除前一致（`^0.1.0-beta.3`）。
- 新增 `src/components/diffRows.ts`：定义 `diff-rows` primitive 与 `createParts`，导出 `DiffRows`、`DiffRowItem`、`diffRows`。
- [DiffView.tsx](../../../src/components/DiffView.tsx)：用 `DiffRows` 包裹行列表，每行改为 `DiffRowItem`；删除行级 `tabIndex` / `onKeyDown`，保留点击跳转与箭头逻辑。
- [App.tsx](../../../src/App.tsx)：新增 `editorFocusNonce` 状态，向 `Editor` 传 `focusRequest`，向 `DiffView` 传 `onEscape`。
- [Editor.tsx](../../../src/components/Editor.tsx)：新增 `focusRequest?: number`，变化时调用 `view.current?.focus()`。
- [types.ts](../../../src/types.ts)：新增 `JumpTarget`，供 `App` / `Editor` / `OfficialPane` 的跳转与聚焦请求共用。
- [AGENTS.md](../../../AGENTS.md)：把「ui-sdk 只用于阶段二 diff 行为层」改成当前事实，写清标准控件仍不得引入 ui-sdk。

接口：

```ts
// src/components/diffRows.ts
export const DiffRows: React.ComponentType<{
  children: React.ReactNode;
  onActivate?: (value: string) => void;
  onEscape?: () => void;
}>;

export const DiffRowItem: React.ComponentType<{
  value: string;
  lineNo: number;
  label: string;
  children: React.ReactNode;
}>;
```

## 7. 测试与验证

- 新增 `tests/diffRows.test.tsx`：
  - 初始只有一行 `tabindex="0"`，其余为 `-1`。
  - `ArrowDown` / `ArrowUp` / `Home` / `End` 的焦点落点，以及导航后的 `tabindex` 迁移。
  - `Enter` 调用 `onJump` 且 `defaultPrevented`。
  - `Enter` 走 `onRowActivate` 时不再调用 `onJump`，焦点留在行上。
  - `Esc` 在行上与行内 `»` 按钮上都调用 `onEscape`。
  - `added` 行被方向键跳过；首行是 `added` 时停靠点落在第一个可聚焦行。
  - 行内 `»` 按钮上的 Enter 不调用 `onJump`。
- 新增 `tests/editorFocus.test.tsx`：`focusRequest` 变化后 `document.activeElement` 是 CodeMirror 内容区；`jumpTo.focus === false` 时不抢走外部焦点；重新挂载时不因历史 `focusRequest` 抢焦点。
- `tests/app.test.tsx` 增加 `diff 行按 Esc 后焦点回到编辑器` 的集成用例。
- 既有 `tests/diffView.test.tsx` 的 9 个用例保持通过。
- `npm run check` 与 `npm run build` 必须通过。

## 8. 风险

- ui-sdk 仍是 beta，`createRovingFocus` 的 API 可能变化；版本锁定，升级时以本地 `node_modules/@ui-sdk/react/docs/llms.txt` 为准。
- `DiffView` 可能渲染两千多行，roving 组需要为每行登记；内存与首屏开销可接受，但必须避免在滚动时重建 primitive。
- jsdom 里 CodeMirror 的焦点断言依赖 `.cm-content`，若断言不稳定，改为断言 `EditorView.hasFocus` 或跳过该用例并保留手动清单。
- `role="group"` 不是表格语义，读屏器不会播报行列关系；这是本次有意接受的取舍。

## 9. 留给实施者的决定

- 行 `aria-label` 的具体文案（是否包含状态词“已改/未知”）。
- 焦点行消失时“回到最近仍存在的行”还是“回到第一行”的实现细节，以 `createRovingFocus` 的能力为准。
- `Space` 是否保留跳转；本设计建议移除，避免与页面滚动冲突。
