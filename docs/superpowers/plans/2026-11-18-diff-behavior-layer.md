# diff 行导航行为层实施计划（阶段二）

状态：已实现 · 本文件是原始计划，步骤未逐条勾选；当前行为以 [设计文档](../specs/2026-11-18-diff-behavior-layer-design.md) 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给「配置对比」加上 roving tabindex 行导航：方向键移动、Home/End、Enter 跳转、Esc 回编辑器。

**Architecture:** 用 `@ui-sdk/core` 的 `createRovingFocus` 定义一个 `diff-rows` primitive，经 `@ui-sdk/react/primitive` 渲染成行组与行；`DiffView` 只负责把行数据传进去，键盘行为全部交给 primitive。视觉继续使用 Tailwind，不引入 ui-sdk 的 CSS。

**Tech Stack:** React 19、TypeScript strict、Tailwind CSS v4、shadcn/ui、`@ui-sdk/core` + `@ui-sdk/react`（beta，仅行为层）、Vitest 5、Testing Library、CodeMirror 6。

**Spec:** [docs/superpowers/specs/2026-11-18-diff-behavior-layer-design.md](../specs/2026-11-18-diff-behavior-layer-design.md)

## Global Constraints

- 纯前端，运行时零外部请求；不重新引入 `@ui-sdk/core/web.css`。
- 标准控件继续使用 `@/components/ui/*`；ui-sdk 只允许出现在 `src/components/diffRows.ts`。
- TypeScript strict，不新增 `any`；共享类型放 `src/types.ts`。
- 禁止直接使用 `useEffect` / `useLayoutEffect`，只允许 [eslint.config.ts](../../../eslint.config.ts) 白名单内的文件。
- 界面文案中文；按最小宽度 1024px 的桌面端设计。
- `npm run lint` 零告警；`eslint-disable` 必须写原因。
- 每个任务结束前运行该任务列出的验证命令，并单独提交，前缀用 `feat:` / `refactor:` / `test:` / `docs:`。
- 最终必须通过 `npm run check` 与 `npm run build`。

## Review Focus

1. **在 CodeMirror 内按方向键**：编辑器自己的方向键不能被 diff 的 roving 抢走；diff 只处理来自行元素的键盘事件。测试落在 Task 3 的“行内按钮不冒泡”用例，编辑器侧行为在 Task 5 手动确认。
2. **`added` 行**：只有右侧内容、没有左侧行号，方向键必须跳过它，不能把焦点停在无法跳转的行上。测试落在 Task 3。
3. **行内 `»` 按钮**：Enter 必须执行“改回默认值”，不能同时触发行跳转。测试落在 Task 3。
4. **折叠块展开/收起后**：roving 组要按新的行集合工作，焦点不能停在被移除的节点上。手动清单在 Task 5。
5. **Esc 回编辑器**：焦点必须真正进入 CodeMirror 内容区，而不是只滚动到左侧面板。测试落在 Task 4。

## 依赖与 API 依据

- `createRovingFocus(context, { slot, key, focusable })`：默认纵向 ↑/↓，自动处理 Home/End；`roving.tabIndex(state, part)`、`roving.keydown(event, el)`、`roving.bind(el, part)`。
- `definePrimitive({ name, options, state, api, slots })`：primitive 定义；`selects({ focused: ({ key }) => [key, null] })` 让 `focused` 状态指向当前行。
- `createParts(primitive, { root: 'div', row: 'div' })`：React 适配层，导出 `DiffRows` / `DiffRowItem`。

参考本地 Skill：[.agents/skills/ui-sdk/SKILL.md](../../../.agents/skills/ui-sdk/SKILL.md) 与 `references/build-interface.md`、`references/create-component.md`。

---

### Task 1: 重新引入 ui-sdk 行为层依赖

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `@ui-sdk/core`、`@ui-sdk/react` 可导入；不引入任何 CSS。

- [ ] **Step 1: 安装依赖**

```bash
npm install @ui-sdk/core@^0.1.0-beta.3 @ui-sdk/react@^0.1.0-beta.3
```

- [ ] **Step 2: 确认没有样式副作用**

`src/index.css` 不应出现 `ui-sdk`、`@layer ui-sdk` 或 `web.css`。

Run: `Select-String -Path src\index.css -Pattern 'ui-sdk' -SimpleMatch`
Expected: 无输出。

- [ ] **Step 3: 验证基线**

```bash
npm run check
npm run build
```

Expected: 全部通过，产物 CSS 体积与阶段一基本一致。

- [ ] **Step 4: 提交**

```bash
git add package.json package-lock.json
git commit -m "feat: 重新引入 ui-sdk 行为层依赖"
```

---

### Task 2: 行导航失败测试

**Files:**
- Create: `tests/diffRows.test.tsx`

**Interfaces:**
- Consumes: `DiffView` 的现有 props（`model`、`warnings`、`onlyDiff`、`onJump`、`onApplyDefault`、`onEscape`）。
- Produces: 后续任务必须满足的键盘契约。

- [ ] **Step 1: 写测试**

```tsx
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { DiffModel, DiffRow } from '../src/lib/diff';

import { DiffView } from '../src/components/DiffView';

const counts: DiffModel['counts'] = {
  changed: 3,
  default: 0,
  added: 1,
  removed: 0,
  newer: 0,
  unknown: 0,
  duplicate: 0,
  special: 0,
  'no-default': 0,
};

function makeRow(lineNo: number, overrides: Partial<DiffRow> = {}): DiffRow {
  return {
    key: `row-${lineNo}`,
    kind: 'changed',
    name: `directive-${lineNo}`,
    canonicalName: `directive-${lineNo}`,
    left: { lines: [{ lineNo, segments: [{ text: `directive-${lineNo} 1`, changed: false }] }] },
    right: { lines: [{ lineNo, segments: [{ text: `directive-${lineNo} 2`, changed: false }] }] },
    status: 'changed',
    risks: [],
    canApplyDefault: true,
    applyValue: '2',
    ...overrides,
  };
}

function renderRows(rows: DiffRow[], onJump = vi.fn(), onEscape = vi.fn(), onApplyDefault = vi.fn()) {
  const model: DiffModel = { rows, counts, total: rows.length };
  const utils = render(
    <DiffView
      model={model}
      warnings={[]}
      onlyDiff
      onJump={onJump}
      onApplyDefault={onApplyDefault}
      onEscape={onEscape}
    />,
  );
  return { ...utils, onJump, onEscape, onApplyDefault };
}

const rowElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-slot="diff-row"]'));

test('整个行组只有一个 tab stop', () => {
  const { container } = renderRows([makeRow(10), makeRow(20)]);
  const rows = rowElements(container);
  expect(rows[0]).toHaveAttribute('tabindex', '0');
  expect(rows[1]).toHaveAttribute('tabindex', '-1');
});

test('方向键与 Home/End 移动焦点', async () => {
  const { container } = renderRows([makeRow(10), makeRow(20), makeRow(30)]);
  const rows = rowElements(container);

  rows[0].focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(rows[1]).toHaveFocus();

  await userEvent.keyboard('{End}');
  expect(rows[2]).toHaveFocus();

  await userEvent.keyboard('{Home}');
  expect(rows[0]).toHaveFocus();
});

test('Enter 跳转且阻止默认行为', async () => {
  const { container, onJump } = renderRows([makeRow(10), makeRow(20)]);
  rowElements(container)[1].focus();
  await userEvent.keyboard('{Enter}');
  expect(onJump).toHaveBeenCalledWith(20);
});

test('Esc 请求回到编辑器', async () => {
  const { container, onEscape } = renderRows([makeRow(10)]);
  rowElements(container)[0].focus();
  await userEvent.keyboard('{Escape}');
  expect(onEscape).toHaveBeenCalledTimes(1);
});

test('没有左侧行号的行被方向键跳过', async () => {
  const added = makeRow(0, {
    key: 'added',
    kind: 'added',
    left: undefined,
    canApplyDefault: false,
    applyValue: null,
  });
  const { container } = renderRows([makeRow(10), added, makeRow(30)]);
  const rows = rowElements(container);

  rows[0].focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(rows[2]).toHaveFocus();
});

test('行内改回默认值按钮不触发行跳转', async () => {
  const { container, onJump, onApplyDefault } = renderRows([makeRow(10)]);
  const arrow = container.querySelector<HTMLButtonElement>('button[aria-label*="改回官方默认值"]');
  expect(arrow).not.toBeNull();
  arrow!.focus();
  await userEvent.keyboard('{Enter}');
  expect(onApplyDefault).toHaveBeenCalled();
  expect(onJump).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/diffRows.test.tsx`
Expected: FAIL —— 找不到 `[data-slot="diff-row"]`，或键盘断言不成立。

- [ ] **Step 3: 不提交**

测试与实现同属 Task 3 的交付，等实现通过后一起提交。

---

### Task 3: `diff-rows` primitive 与 DiffView 接入

**Files:**
- Create: `src/components/diffRows.ts`
- Modify: `src/components/DiffView.tsx`
- Test: `tests/diffRows.test.tsx`

**Interfaces:**
- Produces: `DiffRows({ children, onActivate, onEscape })`、`DiffRowItem({ value, lineNo, label, children })`。
- `DiffView` 新增 `onEscape?: () => void`。

- [ ] **Step 1: 定义 primitive**

`src/components/diffRows.ts`：

```ts
import { createRovingFocus, definePrimitive, selects } from '@ui-sdk/core';
import { createParts } from '@ui-sdk/react/primitive';

type DiffRowsState = { focused: string | null };
type DiffRowProps = { value: string; lineNo: number; label: string };

const diffRows = definePrimitive({
  name: 'diff-rows',
  options: { onActivate: 'callback', onEscape: 'callback' },
  state: (): DiffRowsState => ({ focused: null }),
  api: (context) => {
    const roving = createRovingFocus<DiffRowsState, DiffRowProps>(context, {
      slot: 'row',
      key: 'focused',
      focusable: (item) => item.props.lineNo > 0,
    });
    return {
      roving,
      keydown(event: KeyboardEvent, el: HTMLElement, value: string) {
        if (event.target !== el) {
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          context.options().onActivate?.(value);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          context.options().onEscape?.();
          return;
        }
        roving.keydown(event, el);
      },
    };
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: 'group', 'aria-label': '配置对比行' }) }),
    row: slot<DiffRowProps>({
      props: { value: 'string', lineNo: 'number', label: 'string' },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        'data-slot': 'diff-row',
        'aria-label': part.props.label,
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
});

const parts = createParts(diffRows, { root: 'div', row: 'div' });

export const DiffRows = parts.Root;
export const DiffRowItem = parts.Row;
export { diffRows };
```

注意：`api.keydown` 必须以 `event.target !== el` 提前返回，避免行内 `»` 按钮的 Enter 冒泡触发行跳转；`focused` 状态由 `roving.bind` 维护，不要在手写的 focus 回调里再调用 `roving.focus`，否则会递归。

- [ ] **Step 2: 改 DiffView**

- `DiffViewProps` 增加 `onEscape?: () => void`。
- 行列表外层从 `<div className="min-h-0 flex-1 overflow-auto">` 改为 `<DiffRows onActivate={...} onEscape={onEscape}>`，保留滚动样式。
- 折叠按钮留在 `DiffRows` 内部也可以（它是普通 button，不参与 roving），但不要给它 `data-slot="diff-row"`。
- `DiffRowView` 根节点从 `div` 改为 `DiffRowItem`，传 `value={row.key}`、`lineNo={firstLeft}`、`label={`第 ${firstLeft} 行，${row.name}`}`；删除 `tabIndex` 与 `onKeyDown`。
- `onActivate` 通过 `useMemo` 建 `Map<string, number>`，key 为 `row.key`，值为 `firstLeft`；回调里查表调用 `onJump`。没有左侧行号的行不加入 Map。
- 行内 `»` 按钮加 `onKeyDown={(event) => event.stopPropagation()}`。

- [ ] **Step 3: 运行测试**

Run: `npx vitest run tests/diffRows.test.tsx tests/diffView.test.tsx`
Expected: 新增用例与既有 9 个 diff 用例全部通过。

- [ ] **Step 4: 门禁与提交**

```bash
npm run lint
npm run typecheck
git add src/components/diffRows.ts src/components/DiffView.tsx tests/diffRows.test.tsx
git commit -m "feat: diff 行支持方向键与 roving tabindex"
```

---

### Task 4: Esc 回焦编辑器

**Files:**
- Modify: `src/App.tsx`、`src/components/Editor.tsx`
- Test: `tests/editorFocus.test.tsx`

**Interfaces:**
- `Editor` 新增 `focusRequest?: number`。
- `App` 新增内部状态 `editorFocusNonce`，`DiffView` 的 `onEscape` 让它自增。

- [ ] **Step 1: 写失败测试**

```tsx
import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import type { AnalysisResult } from '../src/types';

import { Editor } from '../src/components/Editor';

const result: AnalysisResult = {
  lines: [],
  byLine: new Map(),
  counts: { changed: 0, unknown: 0, removed: 0, newer: 0, duplicate: 0 },
  missing: [],
  firstLineOf: new Map(),
  effective: new Map(),
};

test('focusRequest 变化后焦点进入编辑器', () => {
  const { rerender } = render(
    <Editor
      value="maxmemory 0"
      result={result}
      blocks={[]}
      onlyDiff={false}
      jumpTo={null}
      focusRequest={0}
      onChange={vi.fn()}
      onCursorLine={vi.fn()}
      onCommitComment={vi.fn()}
    />,
  );
  rerender(
    <Editor
      value="maxmemory 0"
      result={result}
      blocks={[]}
      onlyDiff={false}
      jumpTo={null}
      focusRequest={1}
      onChange={vi.fn()}
      onCursorLine={vi.fn()}
      onCommitComment={vi.fn()}
    />,
  );
  expect(document.activeElement).toHaveClass('cm-content');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/editorFocus.test.tsx`
Expected: FAIL —— 不支持 `focusRequest`，焦点仍在 body。

- [ ] **Step 3: 实现**

`Editor.tsx` 增加：

```tsx
useEffect(() => {
  const instance = view.current;
  if (!instance || !props.focusRequest) {
    return;
  }
  instance.focus();
}, [props.focusRequest]);
```

`App.tsx` 增加 `const [editorFocusNonce, setEditorFocusNonce] = useState(0);`，把 `focusRequest={editorFocusNonce}` 传给 `Editor`，把 `onEscape={() => setEditorFocusNonce((value) => value + 1)}` 传给 `DiffView`。

- [ ] **Step 4: 验证并提交**

```bash
npx vitest run tests/editorFocus.test.tsx tests/diffRows.test.tsx
npm run lint
npm run typecheck
git add src/App.tsx src/components/Editor.tsx tests/editorFocus.test.tsx
git commit -m "feat: Esc 将焦点送回编辑器"
```

---

### Task 5: 文档同步与全量验证

**Files:**
- Modify: `AGENTS.md`、`docs/superpowers/specs/2026-11-18-diff-behavior-layer-design.md`

- [ ] **Step 1: 写清 ui-sdk 的当前用途**

AGENTS.md 的「阶段二例外」改为当前事实：

- ui-sdk 仅用于 `src/components/diffRows.ts` 的行导航行为层。
- 标准控件仍从 `@/components/ui/*` 组合，不得引入 ui-sdk。
- 不引入 `@ui-sdk/core/web.css`，样式仍用 Tailwind。

- [ ] **Step 2: 更新 spec 状态**

把 `2026-11-18-diff-behavior-layer-design.md` 的状态改为 `已实现`。

- [ ] **Step 3: 全量验证**

```bash
npm run check
npm run build
```

Expected: 全部通过。

- [ ] **Step 4: 手动走查**

`npm run dev`，在 1024px 窗口确认：

- Tab 进入 diff 只有一个停靠点，方向键与 Home/End 正常。
- Enter 跳转后焦点仍在 diff；Esc 回到编辑器且可继续输入。
- `added` 行被跳过；`»` 按钮 Enter 只改默认值。
- 展开折叠块后方向键仍连续；切换 `onlyDiff` 后焦点落在有效行。
- 切换 Tabs 再回来，diff 仍可导航（允许焦点回到第一行）。

- [ ] **Step 5: 提交**

```bash
git add AGENTS.md docs/superpowers/specs/2026-11-18-diff-behavior-layer-design.md
git commit -m "docs: 记录 diff 行为层与 ui-sdk 的用途"
```
