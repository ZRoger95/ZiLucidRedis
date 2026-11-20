# v2 官方版本来源与 IDEA 式配置 diff 实施计划

状态：已实现 · 本文件是原始计划，步骤未逐条勾选；计划里把构建脚本写作 `.mjs`，最终落地为 Node 原生 `.ts`。当前行为以 [设计文档](../specs/2026-11-17-diff-experience-design.md) 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把版本来源换成 GitHub Releases 的正式版，并把底部「配置对比」重做成按指令语义对齐、IDEA 风格的并排 diff。

**Architecture:** 构建期脚本先从 Releases API 解析每条 minor 线的最新正式 patch，再生成带 `publishedAt` 的字典与 `releases.json`；运行期新增纯函数 `src/lib/diff.ts` 把现有 `analyze` 结果转成左右对齐的 diff 模型，由新的 `DiffView` 组件渲染，`App` 负责接线与「改回默认值」回调。

**Tech Stack:** Vite 8、React 19、TypeScript strict、Vitest 5、@testing-library/react、shadcn/ui + Tailwind CSS v4、Node ESM 构建脚本。

**Spec:** `docs/superpowers/specs/2026-11-17-diff-experience-design.md`

## Global Constraints

- 纯前端，运行时不得请求任何外部网络；新数据全部构建期生成并提交。
- 不新增运行时或开发依赖；Node 脚本保持 `.mjs` ESM。
- TypeScript strict；新增逻辑先写 Vitest 测试再实现。
- 界面文案中文；diff 是只读视图，唯一会改文本的动作是用户显式点击箭头。
- 不把明文密码写入 localStorage；应用默认值不得引入明文密码。
- diff 右侧行集合 = 左侧出现过的指令 + `analysis.missing` 中存在于字典的名字，不铺全量官方项。
- 左侧行号用编辑器真实行号；右侧行号是「官方默认值精简版」的合成序号，从 1 递增。
- 本次不实现推荐配置生成（服务器选型、单机/哨兵/Cluster）。

## Review Focus

- 用户文本含注释、空行、模板行（含 `<`、`|`）时，diff 不能错位或崩溃。测试在 Task 4。
- 同一指令分散在文件两端时，块内每行保留自己的真实行号，点击跳转正确。测试在 Task 4、Task 6。
- `save` 多行与单行默认值比较时，不能被误判为重复或多行丢失。测试在 Task 4。
- 默认值为 `null` 或空串时，箭头不可点或写出合法的 `""`。测试在 Task 5、Task 6。
- 值相同但写法不同（`1gb` vs `1073741824`）不能被标成差异。测试在 Task 4。

---

### Task 1: Releases 版本解析与强制重下

**Files:**
- Create: `scripts/lib/releases.mjs`
- Create: `tests/build/releases.test.ts`
- Modify: `scripts/fetch-upstream.mjs`
- Delete: `scripts/lib/tags.mjs`、`tests/build/tags.test.ts`

**Interfaces:**
- Consumes: GitHub Releases JSON 条目 `{ tag_name, draft, prerelease, published_at }`。
- Produces:
  - `pickStableReleases(releases, lines) -> { line: string; tag: string; publishedAt: string }[]`
  - `needsRedownload(previousEntry, nextTag) -> boolean`，`previousEntry` 允许 `{ tag: string } | string | undefined`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from 'vitest';
import { needsRedownload, pickStableReleases } from '../../scripts/lib/releases.mjs';

const stable = (tag: string, date: string) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: date,
});

describe('pickStableReleases', () => {
  test('filters drafts, prereleases, non X.Y.Z tags and picks newest patch per line', () => {
    const releases = [
      stable('7.4.9', '2026-01-01T00:00:00Z'),
      stable('7.4.12', '2026-10-26T11:51:13Z'),
      { ...stable('7.4.13', '2026-11-01T00:00:00Z'), draft: true },
      { ...stable('8.12.0', '2026-11-12T10:00:00Z'), prerelease: true },
      stable('8.10.3', '2026-10-26T11:56:24Z'),
      stable('9.0.0', '2027-01-01T00:00:00Z'),
      stable('v7.2.1', '2026-01-01T00:00:00Z'),
    ];
    expect(pickStableReleases(releases, ['7.4', '8.10', '8.12'])).toEqual([
      { line: '7.4', tag: '7.4.12', publishedAt: '2026-10-26T11:51:13Z' },
      { line: '8.10', tag: '8.10.3', publishedAt: '2026-10-26T11:56:24Z' },
    ]);
  });
});

describe('needsRedownload', () => {
  test('downloads when tag changed or previous entry is missing/legacy', () => {
    expect(needsRedownload(undefined, '7.4.12')).toBe(true);
    expect(needsRedownload('7.4.12', '7.4.13')).toBe(true);
    expect(needsRedownload({ tag: '7.4.12' }, '7.4.13')).toBe(true);
    expect(needsRedownload({ tag: '7.4.12' }, '7.4.12')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/build/releases.test.ts`
Expected: FAIL，提示找不到 `scripts/lib/releases.mjs`。

- [ ] **Step 3: 实现 `scripts/lib/releases.mjs`**

- `pickStableReleases`：过滤 `draft`、`prerelease`、不匹配 `^\d+\.\d+\.\d+$` 的 tag；按 `major.minor` 分组取 patch 最大；只输出 `lines` 白名单内的线；按线号数值升序；`publishedAt` 原样透传 `published_at`。
- `needsRedownload`：`previousEntry` 为字符串时按 `previousEntry !== nextTag`；为对象时按 `previousEntry.tag !== nextTag`；缺失时返回 `true`。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/build/releases.test.ts`
Expected: PASS。

- [ ] **Step 5: 改写 `scripts/fetch-upstream.mjs`**

- API 改为 `https://api.github.com/repos/redis/redis/releases?per_page=100&page=`，抓 1–3 页，`JSON.parse` 后拼成数组。
- 读取 `data/versions.json` 作为白名单，调用 `pickStableReleases`。
- API 失败时沿用旧 `lock.json`：字符串条目转成 `{ tag, publishedAt: '' }`。
- `saveLine(line, tag, force)`：`force` 为真时无论文件是否存在都重新下载并覆盖 `redis.conf`、`config.c`；否则沿用「存在且非空则跳过」。
- 写入新结构：`lock[line] = { tag, publishedAt }`。

- [ ] **Step 6: 删除旧 tag 解析**

删除 `scripts/lib/tags.mjs` 与 `tests/build/tags.test.ts`。

- [ ] **Step 7: 全量测试**

Run: `npm test`
Expected: 全部 PASS，且不再有 `resolveLatestTag` 的引用。

- [ ] **Step 8: 提交**

```bash
git add scripts/fetch-upstream.mjs scripts/lib/releases.mjs tests/build/releases.test.ts
git add -u scripts/lib/tags.mjs tests/build/tags.test.ts
git commit -m "feat: resolve redis versions from stable releases"
```

---

### Task 2: 生成 publishedAt 与 releases.json，并更新版本展示

**Files:**
- Modify: `scripts/build-dict.mjs`
- Modify: `src/types.ts`
- Create: `src/data/releases.json`（由脚本生成）
- Modify: `src/lib/dict.ts`
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/components/OfficialPane.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/build/build-dict.test.ts`
- Create: `tests/dict.test.ts`

**Interfaces:**
- Consumes: Task 1 的新 `lock.json` 结构 `{ [line]: { tag, publishedAt } }`。
- Produces:
  - `DictFile.publishedAt?: string`
  - `buildDictionary({ line, tag, publishedAt, configC, officialConf, overrides })`
  - `buildReleasesList(lock, versions) -> { line: string; tag: string; publishedAt: string }[]`
  - `ReleaseMeta { line: string; tag: string; publishedAt: string }`
  - `formatVersionLabel(release: ReleaseMeta) -> string`

- [ ] **Step 1: 写失败测试**

在 `tests/build/build-dict.test.ts` 增加（同时把顶部 import 改为 `{ buildDictionary, buildMeta, buildReleasesList }`）：

```ts
test('dictionary carries publishedAt', () => {
  const withDate = buildDictionary({
    line: '7.4',
    tag: '7.4.12',
    publishedAt: '2026-10-26T11:51:13Z',
    configC: parseConfigC(fixture('tests/fixtures/config-sample.c')),
    officialConf: parseOfficialConf(fixture('tests/fixtures/official-sample.conf')),
  }) as any;
  expect(withDate.publishedAt).toBe('2026-10-26T11:51:13Z');
});

test('releases list follows the version allowlist order', () => {
  const lock = {
    '8.10': { tag: '8.10.3', publishedAt: '2026-10-26T11:56:24Z' },
    '7.4': { tag: '7.4.12', publishedAt: '2026-10-26T11:51:13Z' },
  };
  expect(buildReleasesList(lock, [{ line: '7.4' }, { line: '8.10' }])).toEqual([
    { line: '7.4', tag: '7.4.12', publishedAt: '2026-10-26T11:51:13Z' },
    { line: '8.10', tag: '8.10.3', publishedAt: '2026-10-26T11:56:24Z' },
  ]);
});
```

在 `tests/dict.test.ts`：

```ts
import { expect, test } from 'vitest';
import { formatVersionLabel } from '../src/lib/dict';

test('version label shows line, patch and date when available', () => {
  expect(formatVersionLabel({ line: '7.4', tag: '7.4.12', publishedAt: '2026-10-26T11:51:13Z' })).toBe(
    '7.4 · 7.4.12 · 2026-10-26',
  );
  expect(formatVersionLabel({ line: '7.4', tag: '7.4.12', publishedAt: '' })).toBe('7.4 · 7.4.12');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/build/build-dict.test.ts tests/dict.test.ts`
Expected: FAIL，`buildReleasesList` / `formatVersionLabel` 不存在，`publishedAt` 缺失。

- [ ] **Step 3: 实现构建脚本**

- `buildDictionary` 解构 `publishedAt` 并写入返回对象。
- 新增并导出 `buildReleasesList(lock, versions)`：按 `versions` 顺序、只保留 `lock[line]?.tag` 存在的项，字段为 `{ line, tag, publishedAt: lock[line].publishedAt ?? '' }`。
- `main` 读取新 lock 结构，`tag = lock[line].tag`、`publishedAt = lock[line].publishedAt`，写入字典后生成 `src/data/releases.json`（JSON 数组，末尾换行）。

- [ ] **Step 4: 生成数据并确认**

Run: `node scripts/fetch-upstream.mjs`，然后 `node scripts/build-dict.mjs`
Expected: 每条线打印 `ok/build ...`，`src/data/releases.json` 存在且 10 项，`src/data/dict/*.json` 含 `publishedAt`。

- [ ] **Step 5: 更新类型与 UI**

- `src/types.ts`：`DictFile` 增加 `publishedAt?: string`。
- `src/lib/dict.ts`：导入 `releases.json`，导出 `RELEASES` 与 `VERSIONS`（由 `RELEASES` 派生），并实现 `formatVersionLabel`（用 `publishedAt.slice(0, 10)`，空日期时省略该段）。
- `src/components/Toolbar.tsx`：版本下拉的 `items` 改为 `RELEASES.map((release) => ({ value: release.line, label: formatVersionLabel(release) }))`。
- `src/components/OfficialPane.tsx`：新增可选 `publishedAt` prop，标题拼成 `官方完整配置 · {tag} · {date} · 只读`，日期为空时省略。
- `src/App.tsx`：官方状态增加 `publishedAt`，从 `nextDict.publishedAt` 传入 `OfficialPane`。

- [ ] **Step 6: 类型检查与测试**

Run: `npm run typecheck`，再 `npm test`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add scripts/build-dict.mjs src/types.ts src/lib/dict.ts src/components/Toolbar.tsx src/components/OfficialPane.tsx src/App.tsx tests/build/build-dict.test.ts tests/dict.test.ts
git add src/data/dict src/data/official src/data/releases.json data/upstream/lock.json
git commit -m "feat: expose redis release dates in version selector"
```

---

### Task 3: token 级 diff 片段

**Files:**
- Create: `src/lib/diff.ts`
- Create: `tests/diff.test.ts`

**Interfaces:**
- Produces:
  - `DiffSegment { text: string; changed: boolean }`
  - `diffSegments(leftText, rightText) -> { left: DiffSegment[]; right: DiffSegment[] }`

- [ ] **Step 1: 写失败测试**

```ts
import { expect, test } from 'vitest';
import { diffSegments } from '../src/lib/diff';

test('marks changed value tokens and keeps shared prefix unmarked', () => {
  expect(diffSegments('maxmemory 0', 'maxmemory 8gb')).toEqual({
    left: [{ text: 'maxmemory ', changed: false }, { text: '0', changed: true }],
    right: [{ text: 'maxmemory ', changed: false }, { text: '8gb', changed: true }],
  });
});

test('identical text has no changed segments', () => {
  expect(diffSegments('appendonly no', 'appendonly no')).toEqual({
    left: [{ text: 'appendonly no', changed: false }],
    right: [{ text: 'appendonly no', changed: false }],
  });
});

test('falls back to whole-side highlight beyond 400 tokens', () => {
  const long = Array.from({ length: 401 }, (_, index) => `t${index}`).join(' ');
  const result = diffSegments(long, `${long} tail`);
  expect(result.left).toEqual([{ text: long, changed: true }]);
  expect(result.right).toEqual([{ text: `${long} tail`, changed: true }]);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/diff.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `diffSegments`**

- 用 `/(\s+|\S+)/g` 切 token，保留空白。
- 任一侧 token 数 > 400 时直接整段 `changed: true`。
- 用 LCS DP 求未变 token，回溯时优先向上/向左产生稳定结果。
- 把相邻同 `changed` 的片段合并后返回。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/diff.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/diff.ts tests/diff.test.ts
git commit -m "feat: add token level diff segments"
```

---

### Task 4: buildDiff 行模型

**Files:**
- Modify: `src/lib/diff.ts`
- Modify: `tests/diff.test.ts`
- Modify: `src/lib/analyze.ts`（导出 `SPECIAL_NAMES`、`MULTI_VALUE_NAMES`）

**Interfaces:**
- Consumes: `AnalysisResult`、`DictFile`、`RiskWarning[]`。
- Produces:

```ts
type DiffKind =
  | 'changed' | 'default' | 'added' | 'removed' | 'newer'
  | 'unknown' | 'duplicate' | 'special' | 'no-default';

interface DiffLine { lineNo: number; segments: DiffSegment[] }
interface DiffCell { lines: DiffLine[] }

interface DiffRow {
  key: string;
  kind: DiffKind;
  name: string;
  canonicalName: string;
  left: DiffCell | null;
  right: DiffCell | null;
  status: Status | null;
  risks: RiskWarning[];
  note?: string;
  canApplyDefault: boolean;
  applyValue: string | null;
}

interface DiffModel {
  rows: DiffRow[];
  counts: Record<DiffKind, number>;
  total: number;
}

function buildDiff(
  analysis: AnalysisResult,
  dict: DictFile,
  warnings: RiskWarning[],
  options: { onlyDiff: boolean },
): DiffModel;
```

- [ ] **Step 1: 写失败测试**

```ts
import { analyze } from '../src/lib/analyze';
import { parseConf } from '../src/lib/parseConf';
import { aliases } from '../src/data/aliases';
import type { DictFile, DirectiveDoc } from '../src/types';
import { buildDiff } from '../src/lib/diff';

const doc = (name: string, type: string, defaultValue: string | null): DirectiveDoc => ({
  name, section: 'MISC', type, defaultValue,
  defaultSource: defaultValue === null ? 'none' : 'config.c',
  range: null, sensitive: false, modifiable: true, comment: [],
});

const dict: DictFile = {
  line: '7.4', tag: '7.4.12', publishedAt: '',
  sections: [],
  directives: [
    doc('maxmemory', 'ulonglong', '0'),
    doc('appendonly', 'bool', 'no'),
    doc('save', 'special', '3600 1 300 100 60 10000'),
    doc('bind', 'special', null),
    doc('logfile', 'string', ''),
    doc('maxmemory-policy', 'enum', 'noeviction'),
    doc('protected-mode', 'bool', 'yes'),
    doc('replicaof', 'special', null),
  ],
};

const run = (text: string, onlyDiff = false, warnings: any[] = [], meta = {}) => {
  const analysis = analyze(parseConf(text), dict, meta, '7.4', aliases);
  return { analysis, model: buildDiff(analysis, dict, warnings, { onlyDiff }) };
};
```

测试用例与断言：

1. `run('maxmemory 8gb')` → `maxmemory` 行 `kind === 'changed'`、`applyValue === '0'`、左 `lineNo === 1`、右 `lineNo === 1`；`added` 行包含 `maxmemory-policy`、`protected-mode`、`bind`。
2. `run('logfile ""')` → `logfile` 行 `kind === 'default'`，`canApplyDefault === false`。
3. 归一化相等：临时字典把 `maxmemory` 默认值改为 `'1073741824'`，文本 `maxmemory 1gb` → `kind === 'default'`。
4. `run('save 900 1\nsave 300 10')` → 1 个 `save` 行，`left.lines.map(l => l.lineNo)` 为 `[1, 2]`，`right.lines.length === 1`，`canApplyDefault === false`。
5. 非连续重复：`run('maxmemory 0\nappendonly yes\nmaxmemory 8gb')` → 1 个 `duplicate` 行，`left.lines.map(l => l.lineNo)` 为 `[1, 3]`，`note` 非空。
6. `run('foo bar')` → `unknown`；`run('include /tmp/a.conf')` → `special`；`run('bind 127.0.0.1')` → `no-default` 且 `applyValue === null`。
7. 别名：`run('slaveof 127.0.0.1 6379')` → `name === 'slaveof'`、`canonicalName === 'replicaof'`、`note` 含「旧名」。
8. 风险保留：`run('maxmemory 0', true, [{ id: 'r', level: 'high', message: 'm', lineNos: [1], source: 'explicit' }])` → 行仍存在。
9. 右侧合成序号在 `onlyDiff` 过滤前后保持一致：比较 `run(text,false)` 与 `run(text,true)` 中同一 `key` 的 `right.lines[0].lineNo`。
10. 注释、空行、模板行：`run('# c\n\nmaxmemory 0\n<template>')` → 只有 `maxmemory` 与 3 个 `added` 行，不出现 `unknown` 行。

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/diff.test.ts`
Expected: FAIL，`buildDiff` 不存在。

- [ ] **Step 3: 实现 `buildDiff`**

规则：

- 左侧按第一个出现的 canonical name 分组，canonical 取 `analysis.byLine.get(lineNo)?.doc?.name ?? line.name`；保持首次出现顺序。
- 右侧行集合：左侧分组名 + `analysis.missing` 中存在于字典的名字；`added` 行追加在末尾。
- `kind` 判定按此优先级：
  1. 无 doc 且名字在 `SPECIAL_NAMES` → `special`
  2. 无 doc 且状态 `removed` → `removed`
  3. 无 doc 且状态 `newer` → `newer`
  4. 无 doc → `unknown`
  5. 多次出现且名字不在 `MULTI_VALUE_NAMES` → `duplicate`
  6. `defaultValue === null` → `no-default`
  7. 归一化相等 → `default`，否则 `changed`
- 左侧文本用 `raw.trim()`；右侧文本用 `${canonicalName} ${defaultValue === '' ? '""' : defaultValue}`，`defaultValue === null` 时为 `${canonicalName} （官方无默认值）`。
- `changed` / `duplicate` / `default` 用 `diffSegments` 生成左右片段；多行块先按 `\n` 拼接再 diff，最后按换行拆回每行。
- `applyValue`：仅 `changed`、单行、非特殊、非多值、`defaultValue !== null` 时给出 `defaultValue === '' ? '""' : defaultValue`，否则 `null`。
- `canApplyDefault = applyValue !== null`。
- `risks`：`warnings.filter(warning => warning.lineNos.some(lineNo => 左侧行号包含 lineNo))`。
- 别名时 `note = '旧名：<name> → <canonicalName>'`；`duplicate` 时 `note = '同名指令重复，后出现的会覆盖前面的值'`。
- 右侧合成序号：先给未过滤的全部行按顺序编号（每个右侧行从 1 递增），再应用 `onlyDiff` 过滤。`onlyDiff` 保留 `changed/added/removed/newer/unknown/duplicate` 或 `risks.length > 0`。
- `counts` 在未过滤的行上统计；`total` 为未过滤行数。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/diff.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/diff.ts src/lib/analyze.ts tests/diff.test.ts
git commit -m "feat: build directive aligned diff model"
```

---

### Task 5: 应用官方默认值

**Files:**
- Modify: `src/lib/diff.ts`
- Modify: `tests/diff.test.ts`

**Interfaces:**
- Produces: `applyDefaultLine(text, lineNo, defaultValue) -> string`

- [ ] **Step 1: 写失败测试**

```ts
import { applyDefaultLine } from '../src/lib/diff';

test('replaces args and keeps indentation and directive name', () => {
  expect(applyDefaultLine('  maxmemory 0\nappendonly yes', 1, '8gb')).toBe('  maxmemory 8gb\nappendonly yes');
});

test('writes quoted empty string for empty defaults', () => {
  expect(applyDefaultLine('logfile /var/log/redis.log', 1, '')).toBe('logfile ""');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/diff.test.ts`
Expected: FAIL，`applyDefaultLine` 不存在。

- [ ] **Step 3: 实现 `applyDefaultLine`**

- 按 `\n` 拆行，取第 `lineNo - 1` 行。
- 用 `/^\s*/` 取缩进，用首个空白分隔 token 取指令名。
- 新行 = `缩进 + 指令名 + ' ' + (defaultValue === '' ? '""' : defaultValue)`。
- 行号越界时原样返回。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/diff.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/diff.ts tests/diff.test.ts
git commit -m "feat: apply official default to a single config line"
```

---

### Task 6: DiffView 组件与样式

**Files:**
- Create: `src/components/DiffView.tsx`
- Create: `tests/diffView.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `DiffModel`、`RiskWarning[]`、`onlyDiff`。
- Produces: `DiffView({ model, warnings, onlyDiff, onJump, onApplyDefault })`，其中
  `onJump(lineNo: number)`、`onApplyDefault(lineNo: number, value: string)`。

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiffView } from '../src/components/DiffView';
import type { DiffModel } from '../src/lib/diff';

const row = (overrides: any) => ({
  key: 'k', kind: 'changed', name: 'maxmemory', canonicalName: 'maxmemory',
  left: { lines: [{ lineNo: 154, segments: [{ text: 'maxmemory 0', changed: false }] }] },
  right: { lines: [{ lineNo: 1, segments: [{ text: 'maxmemory 8gb', changed: false }] }] },
  status: 'changed', risks: [], canApplyDefault: true, applyValue: '8gb', ...overrides,
});

const model: DiffModel = {
  rows: [row({})],
  counts: { changed: 1, default: 0, added: 0, removed: 0, newer: 0, unknown: 0, duplicate: 0, special: 0, 'no-default': 0 },
  total: 1,
};

test('renders both line numbers and applies default from the arrow', async () => {
  const onApplyDefault = vi.fn();
  render(<DiffView model={model} warnings={[]} onlyDiff={false} onJump={vi.fn()} onApplyDefault={onApplyDefault} />);
  expect(screen.getByText('154')).toBeInTheDocument();
  expect(screen.getByText('1')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '将 maxmemory 改回官方默认值' }));
  expect(onApplyDefault).toHaveBeenCalledWith(154, '8gb');
});

test('jumps to the clicked left line number', async () => {
  const onJump = vi.fn();
  render(<DiffView model={model} warnings={[]} onlyDiff={false} onJump={onJump} onApplyDefault={vi.fn()} />);
  await userEvent.click(screen.getByText('maxmemory 0'));
  expect(onJump).toHaveBeenCalledWith(154);
});

test('collapses long unchanged runs and expands on click', async () => {
  const unchanged = Array.from({ length: 3 }, (_, index) =>
    row({ key: `d${index}`, kind: 'default', canApplyDefault: false, applyValue: null }),
  );
  render(
    <DiffView
      model={{ ...model, rows: unchanged, total: 3 }}
      warnings={[]}
      onlyDiff={false}
      onJump={vi.fn()}
      onApplyDefault={vi.fn()}
    />,
  );
  expect(screen.getByText('@@ 展开 3 行未修改 @@')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/diffView.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现 `DiffView`**

- 顶部标题与计数：`差异 N 项`（`changed+added+removed+newer+unknown+duplicate`）。
- 浮动风险：`warnings.filter(w => w.lineNos.length === 0)` 渲染在上方。
- 行渲染为 grid：左行号、左内容、箭头、右内容、右行号；每个 `DiffLine` 一行。
- `kind` 映射 class：`is-changed`、`is-added`、`is-removed`、`is-newer`、`is-unknown`、`is-duplicate`、`is-special`、`is-no-default`、`is-default`。
- 行内 `segments` 用 `<span className={changed ? 'diff-token' : undefined}>` 渲染。
- `canApplyDefault` 时箭头渲染为 `<button aria-label={`将 ${name} 改回官方默认值`}>`，`onClick` 调 `onApplyDefault(left.lines[0].lineNo, applyValue!)`；否则渲染普通 `<span>`。
- 点击左侧单元格里的 `DiffLine`：用该行真实行号调 `onJump`；点击右侧单元格不跳转。
- 折叠：`onlyDiff === false` 时，连续 `default` 行长度 > 2 折叠成按钮 `@@ 展开 N 行未修改 @@`，点击展开该段。
- 左侧行末渲染风险 `⚠`，`title` 为所有风险 message 的拼接。
- 空模型时显示「当前配置与官方默认值一致」。

- [ ] **Step 4: 添加样式**

仅在 `src/index.css` 新增 `.diff`、`.diff-head`、`.diff-scroll`、`.diff-row`、`.diff-no`、`.diff-cell`、`.diff-gutter`、`.diff-token`、`.diff-collapse` 以及 `.is-*` 背景色。颜色按 spec 7.1：左改 `#ffe9e6` / token `#ffc9c4`，右改 `#e6f6e6` / token `#b7f0b7`。旧 `.compare` 规则留到 Task 7 删除，保证本任务结束时旧组件仍可用。

- [ ] **Step 5: 运行测试与类型检查**

Run: `npm test -- tests/diffView.test.tsx`，再 `npm run typecheck`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/components/DiffView.tsx src/index.css tests/diffView.test.tsx
git commit -m "feat: add side by side diff view"
```

---

### Task 7: 接线、编辑器风险行例外与收尾

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Editor.tsx`
- Delete: `src/components/ComparisonList.tsx`
- Modify: `README.md`
- Modify: `tests/app.test.tsx`（如需）

**Interfaces:**
- Consumes: Task 4 的 `buildDiff`、Task 5 的 `applyDefaultLine`、Task 6 的 `DiffView`。
- Produces: 完整可用的 diff 页面。

- [ ] **Step 1: 接线 `App.tsx`**

- 删除 `ComparisonList` 引用，改导入 `DiffView`、`buildDiff`、`applyDefaultLine`。
- `const diff = useMemo(() => (analysis && dict ? buildDiff(analysis, dict, warnings, { onlyDiff }) : null), [analysis, dict, warnings, onlyDiff]);`
- `const riskLines = useMemo(() => new Set(warnings.flatMap(w => w.lineNos)), [warnings]);`
- `Editor` 增加 `forceVisibleLines={riskLines}`。
- 底部 compare Tab 渲染 `DiffView`，`onJump={jumpToLine}`、`onApplyDefault={(lineNo, value) => setText(applyDefaultLine(text, lineNo, value))}`。
- `DiffView` 所需 `warnings` 直接传入。

- [ ] **Step 2: 修改 `Editor.tsx`**

- Props 增加 `forceVisibleLines?: Set<number>`。
- `quiet` 计算改为：状态属于 `default/no-default/special` **且** `!forceVisibleLines?.has(line.lineNo)`。
- 依赖数组加入 `props.forceVisibleLines`。

- [ ] **Step 3: 删除旧组件与旧样式，更新 README**

- 删除 `src/components/ComparisonList.tsx`。
- 删除 `src/index.css` 中 `.compare`、`.compare-head`、`.compare-scroll`、`.compare table` 及其
  `col-*` / `status-*` 行样式；保留仍被 `SummaryBar` 等使用的 `.badge`。
- README「数据从哪来」改为 GitHub Releases 正式版 + 日期；「使用」里把底部说明改为 IDEA 式 diff 与「点箭头改回默认值」。

- [ ] **Step 4: 全量验证**

Run: `npm run typecheck`
Expected: 无错误。

Run: `npm test`
Expected: 全部 PASS。

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 5: 浏览器冒烟**

Run: `npm run dev`，打开 `http://localhost:5173`
验证：载入官方 7.4 配置 → 改 `maxmemory`、`appendonly` → 底部显示红绿并排 diff 与词级高亮 → 点箭头恢复默认值 → 切「只看差异」→ 展开 `@@` 折叠段 → 缩窄窗口长行换行不溢出 → 版本下拉显示 `7.4 · 7.4.12 · 2026-10-26`。

- [ ] **Step 6: 提交**

```bash
git add src/App.tsx src/components/Editor.tsx src/index.css README.md tests/app.test.tsx
git add -u src/components/ComparisonList.tsx
git commit -m "feat: wire diff view and keep risky lines visible"
```

---

## Self-Review 记录

- Spec 6.1–6.6 的模型、行类型、多行块、词级 diff、过滤规则分别落在 Task 4、5。
- Spec 7.1–7.3 的布局、交互、空状态落在 Task 6。
- Spec 5.1–5.3 的版本来源、构建产物、清理落在 Task 1、2。
- Spec 8 的代码清单与 Task 文件清单一致；`ComparisonList` 删除按依赖顺序放在 Task 7。
- 类型一致性：`DiffKind`、`DiffLine`、`DiffCell`、`DiffRow`、`DiffModel`、`applyValue` 在 Task 4 定义，Task 6 只消费；`formatVersionLabel` 在 Task 2 定义并在 Toolbar 使用。
- Review Focus 的 5 条均已在 Task 4、5、6 的测试中覆盖。
