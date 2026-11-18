# 体检结果面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把编辑器上方的摘要条替换为底部默认选中的「体检结果」Tab，并把「只看差异」开关移到「配置对比」页头。

**Architecture:** 新增纯函数 `src/lib/checkup.ts` 把分析结果与风险告警整理成固定顺序的分组；新增受控组件 `CheckupPanel` 只负责渲染与本地筛选状态；`App` 负责计算分组、跳转与缺失项插入；`DiffView` 收回「只看差异」开关并删除重复计数。

**Tech Stack:** React 19 + TypeScript strict、shadcn/ui（Select / Switch / Tabs）、Tailwind 原子类、Vitest + Testing Library。

**Spec:** `docs/superpowers/specs/2026-11-18-checkup-panel-design.md`

## Global Constraints

- 纯前端、运行时零外部请求；不新增依赖。
- UI 文案中文；界面按最小宽度 1024px 设计。
- 只有 `src/lib/` 纯函数与既有组件测试；禁止直接使用 `useEffect` / `useLayoutEffect`。
- 样式用 Tailwind 原子类；不从 `src/components/ui` 桶文件导入。
- `npm run lint` 零告警；TypeScript strict，不新增 `any`。
- 未经用户明确要求不执行 `git commit`。

## Review Focus

- **空编辑器**：文本为空时不应把 6 条「缺失」当成问题清单铺开，面板应显示「先在左侧载入或粘贴配置」。
- **无行号告警**：`source === 'default'` 的风险没有行号，明细不可点击、不能触发跳转。
- **缺失项无默认值**（如 `bind`）：点击不能插入 `# bind <...>` 注释占位，应打开搜索面板。
- **筛选后为空**：选中某个类别但该类别没有条目时，显示「该类别没有问题」，不能只留空白。
- **未知指令无名称**：解析行没有 `name` 时明细回退为「未知指令」，不能渲染空按钮。

---

### Task 1: 生成体检分组的纯函数

**Files:**
- Create: `src/lib/checkup.ts`
- Test: `tests/checkup.test.ts`

**Interfaces:**
- Consumes: `AnalysisResult`、`RiskWarning`（`src/types.ts`）。
- Produces:
  - `type CheckupKind = 'warning' | 'missing' | 'changed' | 'unknown' | 'removed' | 'newer' | 'duplicate'`
  - `interface CheckupItem { id: string; kind: CheckupKind; label: string; detail?: string; lineNo: number | null; level?: RiskWarning['level'] }`
  - `interface CheckupGroup { kind: CheckupKind; label: string; items: CheckupItem[] }`
  - `buildCheckup(analysis: AnalysisResult, warnings: RiskWarning[]): CheckupGroup[]`
  - `CHECKUP_KIND_LABELS: Record<CheckupKind, string>`，值为 告警 / 缺失 / 已改 / 未知 / 已移除 / 版本不支持 / 重复。

- [ ] **Step 1: 写失败的测试**

新建 `tests/checkup.test.ts`，用手写 `AnalysisResult` 与 `RiskWarning` 断言：

```ts
import { expect, test } from 'vitest';

import type { AnalysisResult, RiskWarning } from '../src/types';

import { buildCheckup } from '../src/lib/checkup';

const analysis = (): AnalysisResult => ({
  lines: [
    { lineNo: 1, raw: 'maxmemory 0', kind: 'directive', name: 'maxmemory', args: ['0'] },
    { lineNo: 2, raw: 'appendonly no', kind: 'directive', name: 'appendonly', args: ['no'] },
    { lineNo: 3, raw: 'slaveof 127.0.0.1 6379', kind: 'directive', name: 'slaveof' },
  ],
  byLine: new Map([
    [1, { lineNo: 1, status: 'changed' }],
    [3, { lineNo: 3, status: 'removed', note: '已废弃：改用 replicaof' }],
  ]),
  counts: { changed: 1, unknown: 0, removed: 1, newer: 0, duplicate: 0 },
  missing: ['bind'],
  firstLineOf: new Map(),
  effective: new Map(),
});

const warnings: RiskWarning[] = [
  { id: 'weak-requirepass', level: 'medium', message: 'requirepass 偏短', lineNos: [1], source: 'explicit' },
  { id: 'no-persistence', level: 'high', message: '没有持久化', lineNos: [], source: 'default' },
];

test('按固定顺序分组，空分组不出现', () => {
  const groups = buildCheckup(analysis(), warnings);
  expect(groups.map((group) => group.kind)).toEqual(['warning', 'missing', 'changed', 'removed']);
});

test('状态明细带指令名、当前值与真实行号', () => {
  const changed = buildCheckup(analysis(), warnings).find((group) => group.kind === 'changed');
  expect(changed?.items[0]).toMatchObject({ label: 'maxmemory', detail: 'maxmemory 0', lineNo: 1 });
});

test('废弃说明优先使用分析备注', () => {
  const removed = buildCheckup(analysis(), warnings).find((group) => group.kind === 'removed');
  expect(removed?.items[0].detail).toBe('已废弃：改用 replicaof');
});

test('无行号告警的 lineNo 为 null，有行号告警取首行', () => {
  const items = buildCheckup(analysis(), warnings).find((group) => group.kind === 'warning')?.items ?? [];
  expect(items.find((item) => item.id === 'warning-no-persistence')?.lineNo).toBeNull();
  expect(items.find((item) => item.id === 'warning-weak-requirepass')?.lineNo).toBe(1);
});

test('缺失项来自 analysis.missing', () => {
  const missing = buildCheckup(analysis(), warnings).find((group) => group.kind === 'missing');
  expect(missing?.items).toEqual([
    { id: 'missing-bind', kind: 'missing', label: 'bind', detail: '未显式配置', lineNo: null },
  ]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/checkup.test.ts`
Expected: FAIL，报 `Failed to resolve import "../src/lib/checkup"`。

- [ ] **Step 3: 实现 `src/lib/checkup.ts`**

导出上述类型与常量。状态明细按 `analysis.byLine` 的行号升序遍历，仅收集 `changed | unknown | removed | newer | duplicate`；`label` 取 `analysis.lines[lineNo - 1]?.name ?? entry.doc?.name ?? '未知指令'`；`detail` 取 `entry.note ?? analysis.lines[lineNo - 1]?.raw.trim()`；`lineNo` 为真实行号；`id` 为 `${kind}-${lineNo}`。告警明细 `id` 为 `warning-${warning.id}`，缺失明细 `id` 为 `missing-${name}`、`detail` 固定为「未显式配置」。最后按 `warning, missing, changed, unknown, removed, newer, duplicate` 排序并过滤空分组。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/checkup.test.ts`
Expected: PASS，5 个用例全绿。

- [ ] **Step 5: 补「未知指令回退」用例并跑通**

在测试中追加一行 `{ lineNo: 4, raw: 'foo bar', kind: 'directive' }` 与对应 `byLine` 的 `unknown` 状态，断言 `label === '未知指令'`。Run: `npm test -- tests/checkup.test.ts`，Expected: PASS。

---

### Task 2: `CheckupPanel` 组件

**Files:**
- Create: `src/components/CheckupPanel.tsx`
- Test: `tests/checkupPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `CheckupGroup`、`CheckupKind`、`CHECKUP_KIND_LABELS`；`@/components/ui/select`。
- Produces: `CheckupPanel({ groups, hasContent, onJump, onInsertMissing })`，其中
  `groups: CheckupGroup[]`、`hasContent: boolean`、`onJump: (lineNo: number) => void`、
  `onInsertMissing: (name: string) => void`。

- [ ] **Step 1: 写失败的组件测试**

新建 `tests/checkupPanel.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { CheckupGroup } from '../src/lib/checkup';

import { CheckupPanel } from '../src/components/CheckupPanel';

const groups: CheckupGroup[] = [
  {
    kind: 'warning',
    label: '告警',
    items: [
      { id: 'warning-a', kind: 'warning', label: '编码里写死的风险', lineNo: 42, level: 'high' },
      { id: 'warning-b', kind: 'warning', label: '默认值触发的风险', lineNo: null, level: 'low' },
    ],
  },
  {
    kind: 'missing',
    label: '缺失',
    items: [{ id: 'missing-bind', kind: 'missing', label: 'bind', detail: '未显式配置', lineNo: null }],
  },
  {
    kind: 'changed',
    label: '已改',
    items: [{ id: 'changed-42', kind: 'changed', label: 'maxmemory', detail: 'maxmemory 0', lineNo: 42 }],
  },
];

test('渲染分组标题与计数', () => {
  render(<CheckupPanel groups={groups} hasContent onJump={vi.fn()} onInsertMissing={vi.fn()} />);
  expect(screen.getByText('共 4 项')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: '告警' })).toBeInTheDocument();
});

test('点击有行号明细触发跳转，无行号告警不可点击', async () => {
  const onJump = vi.fn();
  render(<CheckupPanel groups={groups} hasContent onJump={onJump} onInsertMissing={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /maxmemory/ }));
  expect(onJump).toHaveBeenCalledWith(42);
  expect(screen.queryByRole('button', { name: /默认值触发的风险/ })).not.toBeInTheDocument();
});

test('点击缺失项调用 onInsertMissing', async () => {
  const onInsertMissing = vi.fn();
  render(<CheckupPanel groups={groups} hasContent onJump={vi.fn()} onInsertMissing={onInsertMissing} />);
  await userEvent.click(screen.getByRole('button', { name: /bind/ }));
  expect(onInsertMissing).toHaveBeenCalledWith('bind');
});

test('切换筛选后只剩对应分组，空类别给出提示', async () => {
  render(<CheckupPanel groups={groups} hasContent onJump={vi.fn()} onInsertMissing={vi.fn()} />);
  await userEvent.click(screen.getByRole('combobox', { name: '体检结果筛选' }));
  await userEvent.click(screen.getByRole('option', { name: '重复' }));
  expect(screen.queryByRole('list', { name: '告警' })).not.toBeInTheDocument();
  expect(screen.getByText('该类别没有问题')).toBeInTheDocument();
});

test('没有配置时提示先载入', () => {
  render(<CheckupPanel groups={[]} hasContent={false} onJump={vi.fn()} onInsertMissing={vi.fn()} />);
  expect(screen.getByText('先在左侧载入或粘贴配置')).toBeInTheDocument();
});

test('有配置且没有问题时的空状态', () => {
  render(<CheckupPanel groups={[]} hasContent onJump={vi.fn()} onInsertMissing={vi.fn()} />);
  expect(screen.getByText('当前配置没发现问题')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/checkupPanel.test.tsx`
Expected: FAIL，报找不到 `../src/components/CheckupPanel`。

- [ ] **Step 3: 实现 `src/components/CheckupPanel.tsx`**

- 顶部行：左侧 `Select`（`aria-label="体检结果筛选"`，`SelectTrigger` 固定宽度），选项为 `全部` 加 `CHECKUP_KIND_LABELS` 的 7 项；右侧 `共 {N} 项`。
- 本地状态 `const [filter, setFilter] = useState<'all' | CheckupKind>('all')`。
- 渲染顺序：`hasContent === false` → 「先在左侧载入或粘贴配置」；`total === 0` → 「当前配置没发现问题」；可见分组为空 → 「该类别没有问题」。
- 每个分组渲染 `<section aria-label={group.label}>` 与 `<ul aria-label={group.label}>`；分组标题显示 `label` 与 `items.length`。
- 明细：`lineNo !== null` 或 `kind === 'missing'` 时用 `<button type="button">`，否则用 `<div>`；缺失项点击 `onInsertMissing(item.label)`。
- 在组件内定义 `const LEVEL_SHORT: Record<RiskWarning['level'], string> = { high: '高危', medium: '中危', low: '提示' };`，`warning` 明细渲染该前缀并按 `high → text-unknown`、`medium → text-warning`、`low → text-muted-foreground` 着色（不要从 `DiffView` 导入未导出的常量）。
- 明细文案：`{item.label}`，有 `detail` 时追加灰色说明，有 `lineNo` 时追加「第 N 行」。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/checkupPanel.test.tsx`
Expected: PASS，6 个用例全绿。

- [ ] **Step 5: 跑 lint 与类型检查**

Run: `npm run lint`
Run: `npm run typecheck`
Expected: 均无输出错误。

---

### Task 3: `DiffView` 接管「只看差异」

**Files:**
- Modify: `src/components/DiffView.tsx:9-19`（props）、`235-263`（页头与 floating 告警）
- Modify: `src/App.tsx:447-460`（`DiffView` 调用）
- Test: `tests/diffView.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/switch`。
- Produces: `DiffViewProps` 删除 `warnings`，新增 `onlyDiff: boolean` 与 `onOnlyDiffChange: (value: boolean) => void`，其余 props 不变；`App` 同步更新该处调用，任务结束时全仓 `typecheck` 必须通过。

- [ ] **Step 1: 更新测试调用并追加开关用例**

在 `tests/diffView.test.tsx` 的所有 `<DiffView ... />` 调用中删除 `warnings={[]}`，补上 `onOnlyDiffChange={vi.fn()}`（`onlyDiff` 已有）。追加：

```tsx
test('切换只看差异调用回调', async () => {
  const onOnlyDiffChange = vi.fn();
  render(
    <DiffView
      model={model([row()])}
      onlyDiff={false}
      onOnlyDiffChange={onOnlyDiffChange}
      onJump={vi.fn()}
      onApplyDefault={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByText('只看差异'));
  expect(onOnlyDiffChange).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/diffView.test.tsx`
Expected: FAIL，报 `onOnlyDiffChange` 不存在或找不到「只看差异」。

- [ ] **Step 3: 修改 `DiffView`**

- 删除 `warnings: RiskWarning[]` prop 与函数签名里的解构；删除 `floating` 计算、`diffCount` 计算、`LEVEL_CLASS` 常量与页头下的告警 `<ul>`。
- 页头：`<span className="text-xs text-muted-foreground">共 {model.total} 项</span>`，删除「差异 N 项」。
- 页头右侧在提示文案之后放置 `<label htmlFor="toggle-only-diff">` + `<Switch id="toggle-only-diff" aria-label="只看差异" checked={onlyDiff} onCheckedChange={(checked) => onOnlyDiffChange(checked === true)} />` + 文本「只看差异」；提示文案去掉 `ml-auto`。
- `LEVEL_SHORT` 保留（行内 `⚠` 的 title 仍在用）；确认 `RiskWarning` 类型导入仍被 `LEVEL_SHORT` 使用，否则一并删除。
- 同步更新 `App.tsx` 中的 `<DiffView>`：删除 `warnings={warnings}`，补 `onlyDiff={onlyDiff}` 与 `onOnlyDiffChange={setOnlyDiff}`。此时工具栏仍保留旧开关，两处共用同一个 `onlyDiff` 状态。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/diffView.test.tsx`
Expected: PASS，原有用例与新增开关用例全绿。

- [ ] **Step 5: 跑类型检查**

Run: `npm run typecheck`
Expected: 无错误。

---

### Task 4: 工具栏移除「只看差异」

**Files:**
- Modify: `src/components/Toolbar.tsx:12-27`（props）、`81-89`（开关）
- Modify: `src/App.tsx:331-352`（`Toolbar` 调用）
- Test: `tests/toolbar.test.tsx`

**Interfaces:**
- Produces: `ToolbarProps` 删除 `onlyDiff` 与 `onOnlyDiffChange`；其余不变。`App` 同步删除这两项传参。

- [ ] **Step 1: 更新测试**

`tests/toolbar.test.tsx`：删除 props 里的 `onlyDiff`、`onOnlyDiffChange`，删除「点击“只看差异”文字也能切换开关」用例；保留上传按钮用例。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/toolbar.test.tsx`
Expected: FAIL 或类型错误，组件仍要求已从测试中删除的 `onlyDiff` / `onOnlyDiffChange`。

- [ ] **Step 3: 修改 `Toolbar` 与 `App`**

删除 `onlyDiff` / `onOnlyDiffChange` 的接口声明与整段 `<label htmlFor="toggle-only-diff">`；同步删除 `App` 传给 `<Toolbar>` 的这两项。`Switch` 导入保留（中文摘要仍在用），`id="toggle-zh"` 不变。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/toolbar.test.tsx`
Expected: PASS。

- [ ] **Step 5: 跑 lint 与类型检查**

Run: `npm run lint`
Run: `npm run typecheck`
Expected: 零告警、无类型错误；未使用导入已清除。

---

### Task 5: `App` 接线并删除摘要条

**Files:**
- Modify: `src/App.tsx:15`（导入）、`354-361`（摘要条）、`414-479`（Tab 区）
- Modify: `tests/app.test.tsx`
- Delete: `src/components/SummaryBar.tsx`
- Delete: `tests/summaryBar.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `buildCheckup`、Task 2 的 `CheckupPanel`、Task 3 的 `DiffView` 新 props、Task 4 的 `Toolbar` 新 props。
- Produces: 底部 Tab 值集合 `checkup | compare | detail`，`defaultValue="checkup"`。

- [ ] **Step 1: 先改 `tests/app.test.tsx`**

- 现有「diff 行按 Esc 后焦点回到编辑器」用例：`render(<App />)` 之后先 `await userEvent.click(screen.getByRole('tab', { name: '配置对比' }))`，再等待 diff 行（默认 Tab 变成体检结果后，未激活的 TabsContent 不再渲染）。
- 新增默认 Tab 用例：

  ```tsx
  test('默认展示体检结果', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        line: '7.4',
        text: 'maxmemory 128mb\n',
        annotationMode: 'off',
        onlyDiff: false,
        showZh: false,
        bottomCollapsed: false,
      }),
    );
    render(<App />);
    expect(await screen.findByRole('tab', { name: '体检结果', selected: true })).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: '已改' })).toBeInTheDocument();
  });
  ```

- 新增缺失项无默认值用例：

  ```tsx
  test('点击无默认值的缺失项打开搜索面板', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        line: '7.4',
        text: 'maxmemory 128mb\n',
        annotationMode: 'off',
        onlyDiff: false,
        showZh: false,
        bottomCollapsed: false,
      }),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /bind/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/app.test.tsx`
Expected: FAIL，找不到「体检结果」Tab 或「已改」列表。

- [ ] **Step 3: 删除旧组件与测试**

删除 `src/components/SummaryBar.tsx` 和 `tests/summaryBar.test.tsx`，移除 `App.tsx` 中的 `SummaryBar` 导入与渲染块。

- [ ] **Step 4: 接线**

- 新增 `const checkup = useMemo(() => (analysis ? buildCheckup(analysis, warnings) : []), [analysis, warnings]);`
- 新增缺失插入回调：
  ```ts
  const handleInsertMissing = useCallback(
    (name: string) => {
      const doc = dict?.directives.find((directive) => directive.name === name);
      if (doc && doc.defaultValue === null) {
        setSearchOpen(true);
        return;
      }
      handlePick(name, false);
    },
    [dict, handlePick],
  );
  ```
  若 `handlePick` 不是稳定引用，改用普通函数而不加 `useCallback`，避免引入错误依赖。
- `Tabs` 改为 `defaultValue="checkup"`；`TabsList` 增加第一个 `TabsTrigger value="checkup"`（文案「体检结果」，类名与其他 trigger 相同）。
- 新增第一个 `TabsContent value="checkup"`（类名与 compare 一致）：
  ```tsx
  <CheckupPanel
    groups={checkup}
    hasContent={hasContent}
    onJump={jumpToLine}
    onInsertMissing={handleInsertMissing}
  />
  ```

- [ ] **Step 5: 运行测试与全量检查**

Run: `npm test -- tests/app.test.tsx`
Expected: PASS。
Run: `npm run typecheck`
Run: `npm test`
Expected: 全部通过，无残留 `SummaryBar` 引用。

---

### Task 6: 文档同步

**Files:**
- Modify: `docs/superpowers/specs/2026-11-17-diff-experience-design.md:253-256`
- Modify: `docs/superpowers/specs/2026-11-16-redis-conf-doctor-design.md`（顶部栏结构图与底部 Tab 描述所在小节）
- Modify: `docs/superpowers/specs/2026-11-18-checkup-panel-design.md`（状态、§8 接口描述）
- Modify: `README.md:11-16`、`README.md:68`

**Interfaces:**
- 只改描述，不改代码接口。

- [ ] **Step 1: 更新 v2 diff 设计**

7.2 节把「只看差异」开关改为位于 `DiffView` 页头；把「保留 diff 上方风险提示列表」改为「风险告警移入体检结果面板，diff 行内仍用 `⚠` 标记」。

- [ ] **Step 2: 更新主设计**

顶部栏示意去掉「只看差异」；底部 Tab 结构补「体检结果」为默认页；摘要条相关描述改为指向本 spec。

- [ ] **Step 3: 更新新 spec**

状态改为「已实现」；§5 页头文案统一为「共 N 项」（不写「项问题」，因为「已改」不是问题）；§8 把「给面板传 `analysis`、`warnings`」改为「`App` 用 `buildCheckup` 计算分组，面板接收 `groups`」。

- [ ] **Step 4: 更新 README**

使用说明补充：底部默认是「体检结果」，用于查看问题清单与缺失项；「只看差异」位于「配置对比」页头。目录说明把「摘要条」改为「体检结果面板」。

- [ ] **Step 5: 检查文档格式**

Run: `npm run format:check`
Expected: 通过；若失败执行 `npm run format` 后复查。

---

### Task 7: 全量验证

**Files:**
- 无新增改动，仅验证。

- [ ] **Step 1: 运行完整门禁**

Run: `npm run check`
Expected: lint、format:check、typecheck、test 全部通过。

- [ ] **Step 2: 运行构建**

Run: `npm run build`
Expected: 构建成功，产物在 `dist/`。

- [ ] **Step 3: 浏览器冒烟**

`npm run dev` 后人工确认：载入官方配置 → 默认停在「体检结果」并显示分组计数 → 筛选「告警」只剩告警 → 点明细定位编辑器 → 点缺失项插入或打开搜索 → 切到「配置对比」勾选「只看差异」→ 收起/展开下方面板正常。
