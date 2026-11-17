# shadcn/ui 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把界面控件从 `@ui-sdk/react` 换成 shadcn/ui，引入 Tailwind CSS v4 并将布局样式全量改为原子类，最终移除 ui-sdk。

**Architecture:** 先建立 Tailwind 与 shadcn 基础设施，让两套样式短暂共存；随后按界面区域逐个迁移控件与布局，每一步都能独立构建和提交；全部迁移完成后再删除 ui-sdk 依赖与旧 CSS。`DiffView` 只做样式迁移，行为层重做留到阶段二。

**Tech Stack:** Vite 8、React 19、TypeScript strict、Tailwind CSS v4、shadcn/ui（Radix + CVA）、cmdk、Vitest 5、Testing Library、CodeMirror 6。

**Spec:** [docs/superpowers/specs/2026-11-17-shadcn-migration-design.md](../specs/2026-11-17-shadcn-migration-design.md)

## Global Constraints

- 纯前端，运行时零外部请求；`base: './'` 保留，产物可由静态服务器离线托管。
- 明文密码不落盘；不修改 `src/lib/secrets.ts` 与 `persistence.ts` 的行为。
- TypeScript strict，不新增 `any`；共享类型放 `src/types.ts`。
- 禁止直接使用 `useEffect` / `useLayoutEffect`，只允许 [eslint.config.ts](../../../eslint.config.ts) 白名单内的文件。
- 界面文案中文；按最小宽度 1024px 的桌面端设计，不做移动端适配。
- `npm run lint` 零告警；`eslint-disable` 必须写原因。
- 生成数据不手改：`src/data/dict/*.json`、`src/data/official/*.conf`、`src/data/releases.json`、`src/data/dict/meta.json`。
- 每个任务结束前运行该任务列出的验证命令，并单独提交，提交前缀用 `feat:` / `refactor:` / `docs:` / `test:`。
- 最终必须通过 `npm run check` 与 `npm run build`。

## Review Focus

1. **在 CodeMirror 内按 Cmd/Ctrl+K**：应打开搜索面板，且不能把 `k` 插入文档、不能移动光标。测试落在 Task 2 的 `useShortcut` 用例；编辑器内的真实行为在 Task 12 手动清单确认。
2. **搜索面板无匹配时按 Enter**：不能调用 `onPick`，也不能插入任何指令。测试落在 Task 5。
3. **导出菜单第三项在无占位符时**：显示禁用，点击不触发导出。测试落在 Task 4。
4. **Tabs 折叠状态下切换/展开**：diff 滚动位置、编辑器内容、官方面板定位都不能丢；折叠时面板高度收缩而不是留下空白。手动清单在 Task 12。
5. **版本下拉的长列表**：Radix Select 在 7.0–7.4 多个版本、键盘上下与 Enter 下能正确切换，触发器宽度不被长标签撑破。手动清单在 Task 12。

## 共享类名映射

迁移布局时统一查这张表，避免每个任务自行决定尺寸。

| 旧类名 | Tailwind |
|---|---|
| `.app` | `flex h-full min-w-[1024px] flex-col` |
| `.topbar` | `flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3.5 py-2.5` |
| `.topbar h1` | `mr-3 text-[15px] font-semibold tracking-[0.02em]` |
| `.control` | `inline-flex items-center gap-1.5 text-[13px] text-muted-foreground` |
| `.spacer` | `flex-1` |
| `.summary` | `flex flex-wrap items-center gap-1.5 border-b border-line bg-white px-3.5 py-2 text-[13px]` |
| `.summary button` | `rounded-full border border-transparent bg-transparent px-2 py-0.5 hover:border-line hover:bg-panel` |
| `.banner` | `border-b border-[#fed7aa] bg-[#fff7ed] px-3.5 py-1.5 text-[13px] text-[#9a3412]` |
| `.app-body` | `flex min-h-0 flex-1 flex-col` |
| `.workspace` | `grid min-h-[240px] flex-1 grid-cols-2` |
| `.pane` | `flex min-h-0 min-w-0 flex-col border-r border-line` |
| `.pane-official` | `border-r-0 bg-[#fbfbfc]` |
| `.pane-head` | `flex items-baseline gap-2.5 border-b border-line bg-panel px-3 py-1.5 text-xs text-muted-foreground` |
| `.bottom` | `flex flex-col border-t border-line` + 展开 `h-[36vh] min-h-[220px]`，折叠 `h-auto min-h-0` |
| `.bottom-head` | `flex items-center gap-2 border-b border-line bg-panel px-3 py-1.5` |
| `.tab-panel` | `min-h-0 flex-1 overflow-auto bg-white` |
| `.detail` | `min-h-0 overflow-auto px-[18px] pt-4 pb-10` |
| `.detail h2` | `mb-1 font-mono text-base` |
| `.badge` | `inline-block rounded-full border border-line bg-panel px-2 py-0.5 text-xs text-muted-foreground` |
| `.compare-card` | `my-3 overflow-hidden rounded-lg border border-line` |
| `.compare-row` | `grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2 border-b border-[#f0f1f3] px-2.5 py-1.5 text-[13px]` |
| `.compare-note` | `bg-[#fafbfc] px-2.5 py-1 text-xs text-muted-foreground` |
| `.detail-section` | `mt-3 border-t border-line pt-2.5` |
| `.empty` | `flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground` |
| `.footnote` | `border-t border-line bg-panel px-3.5 py-2 text-xs text-muted-foreground` |
| `.official` | `flex min-h-0 flex-1 flex-col` |
| `.official-head` | `border-b border-line bg-[#f3f4f7] px-3 py-1.5 text-xs text-muted-foreground` |
| `.official-body` | `flex-1 overflow-auto font-mono text-xs leading-[1.55]` |
| `.official-line` | `flex gap-2.5 whitespace-pre px-2.5` |
| `.official-no` | `w-10 flex-none select-none text-right text-[#9aa1ad]` |
| `.diff` | `flex h-full min-h-0 flex-col bg-white` |
| `.diff-row` | `grid grid-cols-[52px_minmax(0,1fr)_28px_minmax(0,1fr)_52px] border-b border-[#f2f3f5] font-mono text-xs leading-[1.7]` |
| `.palette-dialog` | `w-[min(680px,90vw)]` |
| `.palette-list` | `mt-2 max-h-[min(56vh,520px)] overflow-auto` |
| `.palette-hit` | `grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5` |

---

### Task 1: Tailwind 与 shadcn 基础设施

**Files:**
- Modify: `package.json`、`vite.config.ts`、`tsconfig.json`、`src/index.css`、`tests/setup.ts`
- Create: `components.json`、`src/lib/utils.ts`、`src/components/ui/*.tsx`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string`（`@/lib/utils`）；`@/components/ui/{button,select,switch,dropdown-menu,dialog,command,tabs}` 的标准 shadcn 导出。

- [ ] **Step 1: 安装依赖**

```bash
npm install tailwindcss @tailwindcss/vite class-variance-authority clsx tailwind-merge lucide-react tw-animate-css
```

- [ ] **Step 2: 配置 Vite**

`vite.config.ts` 加入 `tailwindcss()` 插件与 `@` 别名：

```ts
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    globals: true,
  },
});
```

- [ ] **Step 3: 配置 tsconfig 别名**

在 `tsconfig.json` 的 `compilerOptions` 中加入：

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 4: 建立 components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/index.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 5: 建立 `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: 接入 Tailwind 与 shadcn 令牌**

`src/index.css` 顶部改为以下顺序（旧样式整段保留在下方，供尚未迁移的控件使用）：

```css
@layer ui-sdk;
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@ui-sdk/core/web.css';

:root {
  --ink: #17181c;
  --muted-text: #5c6370;
  --line: #e2e5ea;
  --panel: #f7f8fa;
  --changed: #b45309;
  --unknown: #b91c1c;
  --removed: #6b7280;
  --newer: #6d28d9;
  --warning: #c2410c;
  --ok: #15803d;

  --background: #ffffff;
  --foreground: var(--ink);
  --card: #ffffff;
  --card-foreground: var(--ink);
  --popover: #ffffff;
  --popover-foreground: var(--ink);
  --primary: var(--ink);
  --primary-foreground: #ffffff;
  --secondary: var(--panel);
  --secondary-foreground: var(--ink);
  --muted: var(--panel);
  --muted-foreground: var(--muted-text);
  --accent: #eceef2;
  --accent-foreground: var(--ink);
  --destructive: var(--unknown);
  --border: var(--line);
  --input: var(--line);
  --ring: #6366f1;
  --radius: 0.5rem;

  --diff-left: #ffe9e6;
  --diff-right: #e6f6e6;
  --diff-token-left: #ffc9c4;
  --diff-token-right: #b7f0b7;
  --diff-added: #dcf5dc;
  --diff-removed: #ffe0dd;
  --diff-newer: #f5f3ff;
  --diff-special: #f9fafb;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-ink: var(--ink);
  --color-line: var(--line);
  --color-panel: var(--panel);
  --color-changed: var(--changed);
  --color-unknown: var(--unknown);
  --color-removed: var(--removed);
  --color-newer: var(--newer);
  --color-warning: var(--warning);
  --color-ok: var(--ok);
  --color-diff-left: var(--diff-left);
  --color-diff-right: var(--diff-right);
  --color-diff-token-left: var(--diff-token-left);
  --color-diff-token-right: var(--diff-token-right);
  --color-diff-added: var(--diff-added);
  --color-diff-removed: var(--diff-removed);
  --color-diff-newer: var(--diff-newer);
  --color-diff-special: var(--diff-special);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}
```

项目原有的 `--muted`（文字色）必须在本步改名为 `--muted-text`，否则会和 shadcn 的 `--muted`（浅色背景）冲突。同步把 `src/index.css` 中所有 `var(--muted)` 与 `src/components/DetailPanel.tsx` 行内样式里的 `var(--muted)` 换成 `var(--muted-text)`。

- [ ] **Step 7: 补 jsdom 垫片**

`tests/setup.ts` 追加：

```ts
import '@testing-library/jest-dom/vitest';

Object.assign(globalThis, {
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

Object.assign(Element.prototype, {
  scrollIntoView: () => {},
  hasPointerCapture: () => false,
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
});
```

- [ ] **Step 8: 生成 shadcn 组件**

```bash
npx shadcn@latest add button select switch dropdown-menu dialog command tabs -y
```

期望：`src/components/ui/` 下出现 `button.tsx`、`select.tsx`、`switch.tsx`、`dropdown-menu.tsx`、`dialog.tsx`、`command.tsx`、`tabs.tsx`；若 CLI 提示缺少依赖，按提示补装后再执行。

- [ ] **Step 9: 验证并提交**

```bash
npm run format
npm run lint
npm run typecheck
npm test
```

期望：全部通过。然后：

```bash
git add -A
git commit -m "feat: 引入 tailwind 与 shadcn 组件"
```

---

### Task 2: `useShortcut` 快捷键 hook

**Files:**
- Create: `src/hooks/useShortcut.ts`、`tests/useShortcut.test.ts`
- Modify: `eslint.config.ts`、`src/App.tsx`

**Interfaces:**
- Produces: `useShortcut(keys: 'mod+k', handler: () => void): void`，在窗口级监听，带 Command/Control 的组合键在输入框内同样触发。

- [ ] **Step 1: 写失败测试**

```tsx
import { fireEvent, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { useShortcut } from '../src/hooks/useShortcut';

test('mod+k 触发回调', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('mod+k', handler));
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(handler).toHaveBeenCalledTimes(1);
});

test('在输入框内同样触发', () => {
  const input = document.createElement('input');
  document.body.append(input);
  const handler = vi.fn();
  renderHook(() => useShortcut('mod+k', handler));
  fireEvent.keyDown(input, { key: 'k', metaKey: true });
  expect(handler).toHaveBeenCalledTimes(1);
});

test('单独 k 或带 shift 不触发', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('mod+k', handler));
  fireEvent.keyDown(window, { key: 'k' });
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true, shiftKey: true });
  expect(handler).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/useShortcut.test.ts`
Expected: FAIL，提示找不到 `../src/hooks/useShortcut`。

- [ ] **Step 3: 实现 hook**

`src/hooks/useShortcut.ts`：

```ts
import { useEffect } from 'react';

export function useShortcut(keys: 'mod+k', handler: () => void): void {
  useEffect(() => {
    const key = keys.split('+').at(-1) ?? '';
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== key) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keys, handler]);
}
```

- [ ] **Step 4: 加入 effect 允许清单**

`eslint.config.ts` 中允许直接使用 effect 的文件数组追加 `'src/hooks/useShortcut.ts'`。

- [ ] **Step 5: App 改用新 hook**

`src/App.tsx` 删除 `import { useShortcut } from '@ui-sdk/react/shortcuts';`，改为 `import { useShortcut } from './hooks/useShortcut';`。调用形式不变。

- [ ] **Step 6: 验证并提交**

```bash
npx vitest run tests/useShortcut.test.ts
npm run lint
npm run typecheck
```

期望：三个用例通过，lint 零告警。提交：

```bash
git add -A
git commit -m "refactor: 用项目内 hook 实现搜索快捷键"
```

---

### Task 3: 工具栏与外壳

**Files:**
- Modify: `src/components/Toolbar.tsx`、`src/App.tsx`、`src/index.css`（删除已迁走的选择器）

**Interfaces:**
- Consumes: `@/components/ui/{button,select,switch}`、`cn`。
- Produces: `Toolbar` 的 props 不变。

- [ ] **Step 1: 迁移 Select**

版本与内联注释两个下拉改为：

```tsx
<Select value={props.line} onValueChange={(value) => props.onLineChange(value)}>
  <SelectTrigger aria-label="Redis 版本" className="w-44">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {items.map((item) => (
      <SelectItem key={item.value} value={item.value}>
        {item.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

内联注释同理，把 `ANNOTATION_OPTIONS` 映射成 `SelectItem`。去掉旧的 `items` prop。

- [ ] **Step 2: 迁移 Switch**

去掉 `SwitchThumb`，改为 `<Switch aria-label="只看差异" checked={...} onCheckedChange={...} />`，外层 `label` 去掉 `.control`，改用共享映射里的类名。

- [ ] **Step 3: 迁移 Button 与外壳布局**

`header`、`h1`、`.spacer`、`.control` 按共享映射改为原子类。所有按钮用 shadcn `Button`：搜索、清空、载入官方配置、上传用 `variant="outline"`，不覆盖高度与圆角。

- [ ] **Step 4: App 外壳同步**

`src/App.tsx` 的 `main.app`、`.app-body`、`.workspace`、`.pane`、`.pane-official`、`.pane-head`、`.footnote` 按映射改为原子类；空态容器 `.empty` 一并处理。此步不改 Tabs 与底部面板。

- [ ] **Step 5: 删除已迁移的 CSS**

从 `src/index.css` 删除 `.topbar`、`.control`、`.spacer`、`.app`、`.app-body`、`.workspace`、`.pane`、`.pane-official`、`.pane-head`、`.pane-hint`、`.footnote`，以及旧的 `button { font: inherit; }`。`.empty` 保留到 Task 6 与 EmptyState 一起删除。

- [ ] **Step 6: 验证并提交**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

期望：全部通过；`app.test.tsx` 仍能找到标题。提交：

```bash
git add -A
git commit -m "refactor: 工具栏改用 shadcn 控件"
```

---

### Task 4: 导出菜单

**Files:**
- Modify: `src/components/ExportMenu.tsx`
- Create: `tests/exportMenu.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/dropdown-menu`、`@/components/ui/button`。
- Produces: `ExportMenu({ onExport, canRestoreSecrets })` 签名不变；第三项在 `canRestoreSecrets === false` 时禁用。

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { ExportMenu } from '../src/components/ExportMenu';

test('无占位符时第三项禁用且不触发导出', async () => {
  const onExport = vi.fn();
  render(<ExportMenu onExport={onExport} canRestoreSecrets={false} />);
  await userEvent.click(screen.getByRole('button', { name: '导出' }));
  const item = screen.getByRole('menuitem', { name: /还原密码后导出/ });
  expect(item).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(item);
  expect(onExport).not.toHaveBeenCalled();
});

test('点击第一项导出原样内容', async () => {
  const onExport = vi.fn();
  render(<ExportMenu onExport={onExport} canRestoreSecrets />);
  await userEvent.click(screen.getByRole('button', { name: '导出' }));
  await userEvent.click(screen.getByRole('menuitem', { name: /原样导出/ }));
  expect(onExport).toHaveBeenCalledWith('original');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/exportMenu.test.tsx`
Expected: FAIL，找不到菜单项（当前 ui-sdk 菜单在 jsdom 下不渲染）。

- [ ] **Step 3: 改用 DropdownMenu**

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline">导出</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={() => onExport('original')}>原样导出（密码保持占位符）</DropdownMenuItem>
    <DropdownMenuItem onSelect={() => onExport('comments')}>补全官方注释后导出</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem disabled={!canRestoreSecrets} onSelect={() => onExport('secrets')}>
      还原密码后导出…
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

- [ ] **Step 4: 验证并提交**

```bash
npx vitest run tests/exportMenu.test.tsx
npm run lint
npm run typecheck
```

期望：两个用例通过。提交：

```bash
git add -A
git commit -m "refactor: 导出菜单改用 shadcn dropdown menu"
```

---

### Task 5: 搜索面板

**Files:**
- Modify: `src/components/SearchPalette.tsx`
- Create: `tests/searchPalette.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/dialog`、`@/components/ui/command`。
- Produces: `SearchPalette` props 不变；搜索仍由 `searchDirectives` 负责。

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { DictFile } from '../src/types';

import { SearchPalette } from '../src/components/SearchPalette';

const dict: DictFile = {
  line: '7.4',
  tag: '7.4.0',
  sections: [{ id: 'general', title: 'General', startLine: 1 }],
  directives: [
    {
      name: 'maxmemory',
      section: 'general',
      type: 'memory',
      defaultValue: '0',
      defaultSource: 'conf-comment',
      range: null,
      sensitive: false,
      modifiable: true,
      comment: ['memory limit'],
    },
  ],
};

test('输入后回车插入匹配项', async () => {
  const onPick = vi.fn();
  render(<SearchPalette open onOpenChange={vi.fn()} dict={dict} configured={new Set()} onPick={onPick} />);
  await userEvent.type(screen.getByRole('combobox'), 'maxmemory');
  await userEvent.keyboard('{Enter}');
  expect(onPick).toHaveBeenCalledWith('maxmemory', false);
});

test('没有匹配项时回车不插入', async () => {
  const onPick = vi.fn();
  render(<SearchPalette open onOpenChange={vi.fn()} dict={dict} configured={new Set()} onPick={onPick} />);
  await userEvent.type(screen.getByRole('combobox'), 'zzzz');
  await userEvent.keyboard('{Enter}');
  expect(onPick).not.toHaveBeenCalled();
  expect(screen.getByText('没有匹配的配置项。')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/searchPalette.test.tsx`
Expected: FAIL，找不到 `combobox`。

- [ ] **Step 3: 改用 Dialog + Command**

保留 `query` 状态与 `hits` 计算，把渲染改为：

```tsx
<Dialog open={open} onOpenChange={handleOpenChange}>
  <DialogContent className="w-[min(680px,90vw)] sm:max-w-[680px]">
    <DialogTitle>搜索配置项</DialogTitle>
    <Command shouldFilter={false} className="mt-2">
      <CommandInput aria-label="搜索配置项" placeholder="输入指令名、分组或中文说明，例如 maxmemory" value={query} onValueChange={setQuery} />
      <CommandEmpty>没有匹配的配置项。</CommandEmpty>
      <CommandList className="max-h-[min(56vh,520px)]">
        {hits.map((hit) => (
          <CommandItem key={hit.name} value={hit.name} onSelect={() => { onPick(hit.name, hit.configured); handleOpenChange(false); }}>
            ...
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  </DialogContent>
</Dialog>
```

`CommandItem` 内部的三行文案结构与类名按共享映射的 `.palette-hit` 改成原子类。`onPick` 在无命中时不会被调用。

- [ ] **Step 4: 验证并提交**

```bash
npx vitest run tests/searchPalette.test.tsx
npm run lint
npm run typecheck
```

期望：两个用例通过。提交：

```bash
git add -A
git commit -m "refactor: 搜索面板改用 shadcn dialog 与 command"
```

---

### Task 6: 底部 Tabs、摘要与空态

**Files:**
- Modify: `src/App.tsx`、`src/components/SummaryBar.tsx`、`src/components/EmptyState.tsx`
- Modify: `src/index.css`（删除已迁走的选择器）

**Interfaces:**
- Consumes: `@/components/ui/tabs`、`@/components/ui/button`。
- Produces: Tabs 值与折叠行为不变。

- [ ] **Step 1: 迁移 Tabs**

用 `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` 替换 ui-sdk 的四个导出。折叠状态按共享映射控制外层高度；`TabsContent` 加 `className={cn('min-h-0 flex-1 overflow-auto bg-white', bottomCollapsed && 'hidden')}`。选中态用 `data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-ink` 表达。

- [ ] **Step 2: 迁移摘要栏**

`SummaryBar` 的容器与按钮按映射改为原子类；`danger` 用 `text-unknown font-semibold`，`warn` 用 `text-warning`。`button` 元素保留 `type="button"`。

- [ ] **Step 3: 迁移空态**

`EmptyState` 改为原子类；两个按钮用 `variant="outline"`；行内 `style` 全部移除。`<code>` 的样式在 Task 10 的 base 层统一提供，这里只保留结构。

- [ ] **Step 4: 删除已迁移的 CSS**

从 `src/index.css` 删除 `.summary`、`.banner`、`.bottom`、`.bottom-head`、`.tab-panel`、`.empty`、`.is-collapsed` 与 `[data-slot='tabs-*']` 相关规则。`.detail-head`、`.detail-grid` 属于 Task 7，不要在本任务删除。

- [ ] **Step 5: 验证并提交**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

期望：`app.test.tsx`、`summaryBar.test.tsx` 通过。提交：

```bash
git add -A
git commit -m "refactor: 底部面板与摘要改用 tailwind"
```

---

### Task 7: 配置项详情

**Files:**
- Modify: `src/components/DetailPanel.tsx`
- Modify: `src/index.css`（删除 `.detail*`、`.compare-*`、`.badge*`）

- [ ] **Step 1: 迁移结构**

按共享映射改写 `.detail`、`.detail-head`、`.meta`、`.badge`、`.compare-card`、`.compare-row`、`.compare-label`、`.compare-note`、`.detail-section`、`.actions`。`badge` 继续用 `span` + 状态类，不引入 shadcn Badge。

- [ ] **Step 2: 保留状态语义**

`is-diff` 行用 `bg-[#fffbeb]`，其中 `code` 用 `text-changed font-semibold`；状态类名沿用 `view.status` 值，映射为对应的 `text-changed` / `text-unknown` / `text-newer` 等。

- [ ] **Step 3: 清掉行内样式**

删除 `style={{ color: 'var(--muted)' }}` 与 `style={{ marginTop: 12 }}`，改用类名。

- [ ] **Step 4: 验证并提交**

```bash
npm run lint
npm run typecheck
npm test
```

提交：

```bash
git add -A
git commit -m "refactor: 配置项详情改用 tailwind"
```

---

### Task 8: 官方面板与注释样式

**Files:**
- Modify: `src/components/OfficialPane.tsx`
- Create: `src/components/editor.css`
- Modify: `src/components/Editor.tsx`

- [ ] **Step 1: 迁移楼层面板**

`official`、`official-head`、`official-body`、`official-line`、`official-no` 按共享映射改为原子类；三种行状态用 `bg-[#fffbeb]`、`bg-[#f4f6ff] text-[#4b5563]`、`bg-[#e0e7ff] text-[#1f2937] shadow-[inset_3px_0_0_#6366f1]`。改完后从 `src/index.css` 删除对应的 `.official*` 选择器。

- [ ] **Step 2: 抽出注释样式**

把 `src/index.css` 中 `.annotation`、`.annotation summary`、`.annotation-body`、`.annotation-commit`、`.official-annotation` 移到 `src/components/editor.css`，并把其中的 `--ui-font-sans` 换成 `var(--font-sans)`。在 `Editor.tsx` 与 `OfficialPane.tsx` 顶部各加 `import './editor.css';`。

- [ ] **Step 3: 迁移 CodeMirror 装饰样式**

同样移入 `editor.css` 的还有 `.editor-host`、`.editor-host .cm-editor`、`.editor-host .cm-scroller`、`.cm-status-*`、`.cm-hide-line`；`.cm-scroller` 的字体改为 `var(--font-mono)`。

- [ ] **Step 4: 验证并提交**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

期望：`official.test.ts`、`annotations.test.ts` 通过。提交：

```bash
git add -A
git commit -m "refactor: 官方面板改用 tailwind 并抽出编辑器样式"
```

---

### Task 9: diff 视图

**Files:**
- Modify: `src/components/DiffView.tsx`
- Modify: `src/index.css`（删除 `.diff*`）

**Interfaces:**
- Consumes: `cn`。
- Produces: `DiffView` props 与 `row.kind` 语义不变。

- [ ] **Step 1: 迁移容器与头部**

`diff`、`diff-head`、`diff-count`、`diff-baseline`、`diff-hint`、`diff-risks`、`diff-empty`、`diff-scroll` 改为原子类；告警等级用 `text-unknown` / `text-warning`。

- [ ] **Step 2: 迁移行结构**

`diff-row` 用共享映射的 grid 模板；`diff-nos`、`diff-no`、`diff-cell`、`diff-line`、`diff-gutter`、`diff-arrow`、`diff-token`、`diff-risk`、`diff-note`、`diff-collapse` 逐个改为原子类。保留 `tabIndex`、`onKeyDown`、`aria-label` 与折叠逻辑不变。

- [ ] **Step 3: 用类名表达状态底色**

删除后代选择器，改为在 JSX 里计算：

```tsx
const leftBg = row.kind === 'changed' || row.kind === 'duplicate' ? 'bg-diff-left' : row.kind === 'removed' || row.kind === 'unknown' ? 'bg-diff-removed' : row.kind === 'newer' ? 'bg-diff-newer' : row.kind === 'special' ? 'bg-diff-special' : '';
const rightBg = row.kind === 'changed' || row.kind === 'duplicate' ? 'bg-diff-right' : row.kind === 'added' ? 'bg-diff-added' : '';
```

token 高亮分别用 `bg-diff-token-left` / `bg-diff-token-right`；`default` 行文字用 `text-muted-foreground`。

- [ ] **Step 4: 验证并提交**

```bash
npm run lint
npm run typecheck
npx vitest run tests/diffView.test.tsx
npm run build
```

期望：diff 的 9 个用例全部通过。提交：

```bash
git add -A
git commit -m "refactor: diff 视图改用 tailwind 原子类"
```

---

### Task 10: 移除 ui-sdk 与旧样式

**Files:**
- Modify: `package.json`、`src/index.css`、`src/App.tsx`（若无遗留引用）、`src/components/*`
- Delete: `@ui-sdk/*` 依赖

- [ ] **Step 1: 卸载依赖**

```bash
npm uninstall @ui-sdk/core @ui-sdk/react
```

- [ ] **Step 2: 清理 index.css**

删除 `@layer ui-sdk;` 与 `@import '@ui-sdk/core/web.css';`，删除所有已迁移的选择器，只保留 Task 1 的 import、`:root`、`@theme inline`、`@layer base` 与新增的基础元素规则。确认 `src/index.css` 中不再有 `var(--muted)`（Task 1 已统一为 `var(--muted-text)`）。

- [ ] **Step 3: 补基础元素样式**

在 `@layer base` 中补 `a` 与 `code`：

```css
a {
  color: var(--ring);
  text-decoration: underline;
  text-underline-offset: 2px;
}
code {
  border-radius: 4px;
  background: var(--panel);
  padding: 0 4px;
  font-family: var(--font-mono);
  font-size: 0.92em;
}
```

- [ ] **Step 4: 确认没有残留引用**

Run: `Select-String -Path src\**\*.tsx,src\**\*.ts,src\index.css -Pattern 'ui-sdk' -SimpleMatch`
Expected: 无输出。

- [ ] **Step 5: 验证并提交**

```bash
npm run check
npm run build
```

期望：全部通过。提交：

```bash
git add -A
git commit -m "refactor: 移除 ui-sdk 依赖与旧样式"
```

---

### Task 11: 规则与文档同步

**Files:**
- Modify: `AGENTS.md`、`docs/engineering/eslint.md`、`docs/superpowers/plans/2026-11-17-v2-diff-experience.md`、`docs/superpowers/specs/2026-11-16-redis-conf-doctor-design.md`

- [ ] **Step 1: 改写 AGENTS.md 的 UI 章节**

删除「不引入 Tailwind」「先读 ui-sdk skill」「只从 @ui-sdk/react 子路径导入」「样式入口 `@layer ui-sdk`」四条。替换为：

- UI 改动先看 `components.json` 与 `src/components/ui/*`，新控件从 `@/components/ui/*` 组合，不自造 `role=` 控件。
- 样式用 Tailwind 原子类；只有 CodeMirror 生成 DOM 的装饰与注释块允许写在 `src/components/editor.css`。
- `.agents/skills/ui-sdk/` 只用于阶段二的 diff 行为层，不用于标准控件。

目录树补 `src/components/ui/`、`src/hooks/`、`components.json`。

- [ ] **Step 2: 同步其余文档**

`docs/engineering/eslint.md` 中「可访问性交给 ui-sdk 组件」改为「可访问性交给 shadcn（Radix）组件」；`2026-11-17-v2-diff-experience.md` 的技术栈一行去掉 ui-sdk 控件；`2026-11-16-redis-conf-doctor-design.md` 的现状描述同步为当前技术栈。

- [ ] **Step 3: 更新本设计状态**

把 `docs/superpowers/specs/2026-11-17-shadcn-migration-design.md` 的状态改为 `已实现`。

- [ ] **Step 4: 验证并提交**

```bash
npm run format:check
git diff --stat
```

提交：

```bash
git add -A
git commit -m "docs: 同步 shadcn 迁移后的工程规则"
```

---

### Task 12: 全量验证

**Files:** 无改动（只验证）

- [ ] **Step 1: 运行门禁**

```bash
npm run check
npm run build
```

Expected: 两条命令退出码均为 0。

- [ ] **Step 2: 手动走查**

`npm run dev`，1024px 窗口逐项确认 Review Focus 的 5 条，并补跑：内联注释下拉、两个开关、导出菜单三项、搜索面板 Cmd/Ctrl+K、Tabs 切换与折叠、编辑器状态底色与“写入配置”、官方面板定位高亮、diff 跳转与“改回默认值”、拖拽导入与清空。

- [ ] **Step 3: 记录结果**

把实际运行的命令与结果写进最终回复，不写未验证的结论。
