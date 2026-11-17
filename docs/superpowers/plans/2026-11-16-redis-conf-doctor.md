# Redis 配置体检工具（ZiLucidRedis）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个纯前端静态网站：贴入或上传 `redis.conf`，逐项对照官方默认值给出体检结果、内联显示官方注释、可编辑，并导出可用的新 conf。

**Architecture:** 构建期用两个 Node 脚本从官方仓库抓取 10 条 minor 线的 `config.c` 与 `redis.conf`，解析成每版本一份的配置项字典（名称/类型/默认值/敏感标记）与跨版本索引；运行期纯浏览器内解析、分析、渲染与导出，无后端、无外部请求。

**Tech Stack:** Vite + React 19 + TypeScript、shadcn/ui、Tailwind CSS v4、CodeMirror 6、Vitest、jsdom、@testing-library/react。

**Spec:** `docs/superpowers/specs/2026-11-16-redis-conf-doctor-design.md`

## Global Constraints

- 纯前端：不引入后端、不在运行时发起任何网络请求；构建产物需能双击 `index.html` 离线使用（`base: './'`）。
- 界面中文，最小宽度 1024px，不做移动端适配。
- 版本清单固定为 10 条 minor 线：`6.2 / 7.0 / 7.2 / 7.4 / 8.0 / 8.2 / 8.4 / 8.6 / 8.8 / 8.10`；每条线取 GitHub 上该线最新的 patch tag，解析结果写入 `data/upstream/lock.json`。
- 密码指令（`sensitive: true`，含 `requirepass`、`masterauth`、`tls-key-file-pass`、`tls-client-key-file-pass`、`user ... >pass`）在导入时即替换为 `${env_<指令名>}` 占位符；原值只存内存，任何持久化/导出内容都不得含明文。
- 导出统一使用 LF 换行，文件末尾保留一个换行。
- 每版本字典的指令数必须落在 140–260，分节数 ≥ 8；默认值为 `null` 的指令必须登记在 `src/data/no-default.json`。
- 所有交互组件从 `@/components/ui/*` 组合（button、select、switch、dropdown-menu、dialog、command、tabs）；不从 `src/components/ui` 的桶文件导入，不自造 `role=` 控件。
- 全局样式表只保留 `@import 'tailwindcss';`、设计令牌与 `@layer base`；CodeMirror 装饰与注释块放 `src/components/editor.css`。

## Review Focus

1. **行尾 `#` 不是注释**：Redis 配置解析不认行尾注释，`maxmemory 100mb # tmp` 的 `#` 与后续词属于参数，不能被截断——Task 6 的解析器测试钉住。
2. **Windows 换行与 BOM**：从 Windows 复制来的 CRLF 文本与带 BOM 的文件必须正常解析，且导出后只剩 LF——Task 6 解析 + Task 12 导出各钉一次。
3. **空文件 / 全是注释**：不应产生告警风暴或崩溃，摘要全 0、缺失项清单照常提示——Task 8 的测试钉住。
4. **同名指令重复**：`save`、`client-output-buffer-limit` 可合法多次出现，不能报重复；`bind` 重复应报——Task 8 的测试钉住。
5. **`include` / `loadmodule`**：属于合法指令但不在字典里，不能报“未知”，否则用户会以为自己配错——Task 8 的测试钉住。

---

## 文件结构

```
ZiLucidRedis/
  index.html  package.json  vite.config.ts  tsconfig.json  README.md
  data/versions.json                    # 10 条 minor 线
  data/upstream/lock.json               # 线 → 实际 patch tag（脚本写入）
  data/upstream/<line>/redis.conf       # 上游原文
  data/upstream/<line>/config.c
  scripts/fetch-upstream.mjs
  scripts/build-dict.mjs
  scripts/lib/tags.mjs                  # tag 解析（纯函数）
  scripts/lib/parse-config-c.mjs        # config.c → 指令定义
  scripts/lib/parse-official-conf.mjs   # redis.conf → 分节 + 注释块
  src/types.ts                          # 全项目共享类型
  src/main.tsx  src/App.tsx  src/index.css
  src/components/  Toolbar.tsx  SummaryBar.tsx  IssueList.tsx  Editor.tsx
                   AnnotationLayer.tsx  DetailPanel.tsx  SearchPalette.tsx
                   ExportMenu.tsx  EmptyState.tsx
  src/lib/  parseConf.ts  normalize.ts  analyze.ts  risks.ts  secrets.ts
            dict.ts  search.ts  annotations.ts  describe.ts  exportConf.ts
            persistence.ts
  src/data/  dict/<line>.json  dict/meta.json  aliases.ts  renames.json
             zh-notes.json  no-default.json  defaults-override.json
             risk-rules.json  sample.conf
  tests/  ...（每个 lib 一个 .test.ts）  tests/fixtures/...
  docs/superpowers/specs/2026-11-16-redis-conf-doctor-design.md
  docs/superpowers/plans/2026-11-16-redis-conf-doctor.md
```

拆分原则：纯函数放 `src/lib`，一文件一件事；构建期脚本放 `scripts`，其纯逻辑下沉到 `scripts/lib` 以便单测；组件只做渲染与事件，不做解析。

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`
- Create: `src/main.tsx`、`src/App.tsx`、`src/index.css`、`tests/setup.ts`、`tests/app.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: 可运行的空壳站点；`npm run build` 产出 `dist/index.html`；Vitest 可跑 jsdom 测试。

- [ ] **Step 1: 安装依赖**

```bash
npm install react react-dom @ui-sdk/react @ui-sdk/core @codemirror/state @codemirror/view @codemirror/commands @codemirror/language
npm install -D typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom
```

- [ ] **Step 2: 配置构建与测试**

`vite.config.ts`：`base: './'`、`plugins: [react()]`、`test: { environment: 'jsdom', setupFiles: './tests/setup.ts', globals: true }`，顶部 `/// <reference types="vitest/config" />`。

`src/index.css` 首行 `@layer ui-sdk;`，随后 `@import '@ui-sdk/core/web.css';`，再写本项目的 CSS 变量与布局。

`tests/setup.ts`：`import '@testing-library/jest-dom';`

- [ ] **Step 3: 写失败的冒烟测试**

`tests/app.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import App from '../src/App';

test('renders the tool title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Redis 配置体检' })).toBeInTheDocument();
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npx vitest run tests/app.test.tsx`
Expected: FAIL（标题不存在）

- [ ] **Step 5: 写最小 App**

`src/App.tsx` 返回 `<main className="min-w-[1024px]"><h1>Redis 配置体检</h1></main>`；`src/main.tsx` 挂载 App。

- [ ] **Step 6: 运行测试与构建确认通过**

Run: `npx vitest run tests/app.test.tsx` → PASS
Run: `npm run build` → 生成 `dist/index.html`，且 `dist/index.html` 中资源路径是 `./assets/...`

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "chore: scaffold vite react ts project with tailwind and vitest"
```

---

### Task 2: 上游数据抓取脚本

**Files:**
- Create: `data/versions.json`、`scripts/fetch-upstream.mjs`、`scripts/lib/tags.mjs`
- Test: `tests/build/tags.test.ts`
- Create（运行产物）: `data/upstream/lock.json`、`data/upstream/<line>/redis.conf`、`data/upstream/<line>/config.c`

**Interfaces:**
- Consumes: 无
- Produces: `resolveLatestTag(tags: string[], line: string): string | null`（`scripts/lib/tags.mjs`）；`data/upstream/lock.json` 形如 `{ "6.2": "6.2.19", "7.4": "7.4.12", ... }`

- [ ] **Step 1: 写失败的测试**

`tests/build/tags.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { resolveLatestTag } from '../../scripts/lib/tags.mjs';

describe('resolveLatestTag', () => {
  const tags = ['8.10.3', '8.10.2', '8.2.11', '7.4.12', '7.4.9', '6.2.19', 'v7.0-rc1'];
  test('picks the numerically newest patch for a line', () => {
    expect(resolveLatestTag(tags, '7.4')).toBe('7.4.12');
    expect(resolveLatestTag(tags, '8.10')).toBe('8.10.3');
  });
  test('does not confuse 8.1 with 8.10', () => {
    expect(resolveLatestTag(tags, '8.1')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/build/tags.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 tag 解析**

`scripts/lib/tags.mjs` 导出 `resolveLatestTag(tags, line)`：只接受匹配 `^<line>\.\d+$` 的 tag（点号需转义），按 patch 数字降序取第一个。

- [ ] **Step 4: 实现抓取脚本**

`data/versions.json`：

```json
[
  { "line": "6.2" }, { "line": "7.0" }, { "line": "7.2" }, { "line": "7.4" }, { "line": "8.0" },
  { "line": "8.2" }, { "line": "8.4" }, { "line": "8.6" }, { "line": "8.8" }, { "line": "8.10" }
]
```

`scripts/fetch-upstream.mjs`：
1. 拉 `https://api.github.com/repos/redis/redis/tags?per_page=100&page=1..3` 汇总 tag 名；
2. 每条线 `resolveLatestTag`，写入 `data/upstream/lock.json`；API 失败时退回读已有 lock.json 并打印警告；
3. 对每线下载 `https://raw.githubusercontent.com/redis/redis/<tag>/redis.conf` 与 `<tag>/src/config.c` 到 `data/upstream/<line>/`；
4. 单文件失败重试 3 次，间隔 1s、2s、4s；已存在且大小 > 0 则跳过。

- [ ] **Step 5: 运行并检查产物**

Run: `node scripts/fetch-upstream.mjs`
Expected: 打印 10 行 `ok <line> <tag>`；随后

```powershell
Get-ChildItem data/upstream -Recurse -File | Measure-Object Length -Sum
```

10 个目录、20 个文件，`redis.conf` 均 > 50000 字节，`config.c` 均 > 50000 字节。

- [ ] **Step 6: 提交**

```bash
git add data scripts/fetch-upstream.mjs scripts/lib/tags.mjs tests/build/tags.test.ts
git commit -m "feat: fetch official redis.conf and config.c for ten minor lines"
```

---

### Task 3: config.c 解析器

**Files:**
- Create: `scripts/lib/parse-config-c.mjs`、`tests/fixtures/config-sample.c`
- Test: `tests/build/parse-config-c.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `parseConfigC(source: string): { entries: ConfigCEntry[]; unresolved: string[] }`，`ConfigCEntry = { name: string; type: string; defaultValue: string | null; range: string | null; sensitive: boolean; modifiable: boolean; multiArg: boolean }`

- [ ] **Step 1: 写失败的测试**

`tests/fixtures/config-sample.c` 放入四类真实写法（bool、uint 带上下界、ulonglong+`MEMORY_CONFIG`、enum、SDS+`SENSITIVE_CONFIG`、special 多参数各一条），例如：

```c
standardConfig static_configs[] = {
    createBoolConfig("protected-mode", NULL, MODIFIABLE_CONFIG, server.protected_mode, 1, NULL, NULL),
    createUIntConfig("maxclients", NULL, MODIFIABLE_CONFIG, 1, UINT_MAX, server.maxclients, 10000, INTEGER_CONFIG, NULL, updateMaxclients),
    createULongLongConfig("maxmemory", NULL, MODIFIABLE_CONFIG, 0, ULLONG_MAX, server.maxmemory, 0, MEMORY_CONFIG, NULL, updateMaxmemory),
    createEnumConfig("maxmemory-policy", NULL, MODIFIABLE_CONFIG, maxmemory_policy_enum, server.maxmemory_policy, MAXMEMORY_NO_EVICTION, NULL, NULL),
    createSDSConfig("requirepass", NULL, MODIFIABLE_CONFIG | SENSITIVE_CONFIG, EMPTY_STRING_IS_NULL, server.requirepass, NULL, NULL, updateRequirePass),
    createSpecialConfig("save", NULL, MODIFIABLE_CONFIG | MULTI_ARG_CONFIG, setConfigSaveOption, getConfigSaveOption, rewriteConfigSaveOption, NULL),
    createReplCfgConfig("newfangled-option", NULL, IMMUTABLE_CONFIG, server.newfangled, 7, NULL, NULL),
};
static configEnum maxmemory_policy_enum[] = {
    {"noeviction", MAXMEMORY_NO_EVICTION},
    {"allkeys-lru", MAXMEMORY_ALLKEYS_LRU},
};
```

`tests/build/parse-config-c.test.ts`：

```ts
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseConfigC } from '../../scripts/lib/parse-config-c.mjs';

const src = readFileSync(new URL('../fixtures/config-sample.c', import.meta.url), 'utf8');
const result = parseConfigC(src);
const byName = new Map(result.entries.map((e: any) => [e.name, e]));

test('bool default becomes yes/no', () => {
  expect(byName.get('protected-mode').defaultValue).toBe('yes');
  expect(byName.get('protected-mode').sensitive).toBe(false);
});

test('uint keeps bounds and default', () => {
  expect(byName.get('maxclients').defaultValue).toBe('10000');
  expect(byName.get('maxclients').range).toBe('1..UINT_MAX');
});

test('memory default is human readable', () => {
  expect(byName.get('maxmemory').defaultValue).toBe('0');
});

test('enum default is resolved to its string', () => {
  expect(byName.get('maxmemory-policy').defaultValue).toBe('noeviction');
});

test('sds NULL default is the empty string and sensitive flag is read', () => {
  expect(byName.get('requirepass').defaultValue).toBe('');
  expect(byName.get('requirepass').sensitive).toBe(true);
});

test('multi arg and immutable flags are read', () => {
  expect(byName.get('save').multiArg).toBe(true);
  expect(byName.get('newfangled-option').modifiable).toBe(false);
});

test('unknown create function is reported, not silently dropped', () => {
  expect(result.unresolved).toContain('newfangled-option');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/build/parse-config-c.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现解析器**

`parseConfigC(source)`：
1. 用正则收集所有 `create<Type>Config(` 调用，按括号配平切出实参串，再按顶层逗号切分（跳过字符串与嵌套括号内的逗号）；`type` 取函数名去掉 `create`/`Config` 并转小写。
2. `name` = 第 1 个实参去引号。
3. **默认值取“含 `server.` 的那个实参之后的下一个实参”**——该规则同时覆盖 bool、数值、enum、字符串与 SDS（它们都遵循“变量、默认值、…”的顺序）。
4. 默认值解释：`NULL` → `''`；bool 型 `0/1` → `no/yes`；含 `MEMORY_CONFIG` 且数值 > 0 → `formatMemory(bytes)`（`1048576` → `1mb`），0 保持 `0`；enum 型用全文 `{"字面量", 常量}` 表反查，查不到或常量在多组枚举里冲突 → `null` 并计入 `unresolved`。
5. 数值型的 `min, max` 两实参拼成 `range`（形如 `1..UINT_MAX`），长度不是 2 个 token 时为 `null`。
6. `sensitive` = 任一实参含 `SENSITIVE_CONFIG`；`modifiable` = 不含 `IMMUTABLE_CONFIG`；`multiArg` = 含 `MULTI_ARG_CONFIG`。
7. `createSpecialConfig` 的 `defaultValue` 一律为 `null`（由 Task 5 用官方 conf 的示例行补）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/build/parse-config-c.test.ts`
Expected: 7 passed

- [ ] **Step 5: 提交**

```bash
git add scripts/lib/parse-config-c.mjs tests/build/parse-config-c.test.ts tests/fixtures/config-sample.c
git commit -m "feat: parse config.c into directive definitions with defaults"
```

---

### Task 4: 官方 redis.conf 解析器

**Files:**
- Create: `scripts/lib/parse-official-conf.mjs`、`tests/fixtures/official-sample.conf`
- Test: `tests/build/parse-official-conf.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `parseOfficialConf(source: string): { sections: { id: string; title: string; startLine: number }[]; byName: Map<string, { comment: string[]; commentedValues: string[][] }> }`

- [ ] **Step 1: 写失败的测试**

`tests/fixtures/official-sample.conf` 需覆盖：分节标题、指令的连续注释块、注释块与指令之间隔空行、`# maxmemory <bytes>` 模板行、`# save ""` 与 `# save 3600 1 300 100` 两条候选、示例行本身带行内 `#`。

`tests/build/parse-official-conf.test.ts`：

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseOfficialConf } from '../../scripts/lib/parse-official-conf.mjs';

const parsed = parseOfficialConf(readFileSync(new URL('../fixtures/official-sample.conf', import.meta.url), 'utf8'));

test('sections are lifted from the banner lines', () => {
  expect(parsed.sections.map((s: any) => s.id)).toEqual(['NETWORK', 'SNAPSHOTTING']);
});

test('comment block directly above the directive is captured', () => {
  expect(parsed.byName.get('tcp-backlog')!.comment[0]).toContain('TCP listen() backlog');
});

test('a blank line breaks the comment block', () => {
  expect(parsed.byName.get('maxclients')!.comment).toEqual([]);
});

test('template lines are not treated as concrete values', () => {
  expect(parsed.byName.get('maxmemory')!.commentedValues).toEqual([]);
});

test('concrete commented values are kept in file order', () => {
  expect(parsed.byName.get('save')!.commentedValues).toEqual([[], ['3600', '1', '300', '100']]);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/build/parse-official-conf.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现解析器**

1. 分节标题：匹配 `^#{5,}\s*(.+?)\s*#{5,}\s*$`，`id` 取标题原文。
2. 逐行扫描，记录每行是否指令（首个 token 匹配 `^[A-Za-z][A-Za-z0-9-]*$`）。
3. 注释块：遇到指令行时，向上收集连续 `#` 行（遇空行或非注释即停），去掉 `#` 与首尾空行，作为该名字的 `comment`（同名只保留第一次非空的）。
4. 注释形式的指令：`# name args...`，`args` 用与运行期相同的引号切分规则；若任一 token 含 `<` 或 `>` 则整条丢弃；否则追加到 `commentedValues`。`# save ""` 切出空参数数组 `[]`。
5. 示例行里行内 `#` 之后的文字不参与切分（与 Redis 行为一致，行内 `#` 只是参数文本）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/build/parse-official-conf.test.ts`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add scripts/lib/parse-official-conf.mjs tests/build/parse-official-conf.test.ts tests/fixtures/official-sample.conf
git commit -m "feat: parse official redis.conf into sections and comment blocks"
```

---

### Task 5: 字典构建、跨版本索引与断言

**Files:**
- Create: `scripts/build-dict.mjs`、`src/data/no-default.json`、`src/data/defaults-override.json`、`src/data/renames.json`
- Create（运行产物）: `src/data/dict/<line>.json`、`src/data/dict/meta.json`
- Test: `tests/build/build-dict.test.ts`

**Interfaces:**
- Consumes: `parseConfigC`（Task 3）、`parseOfficialConf`（Task 4）
- Produces: `buildDictionary({ line, tag, configC, officialConf }): DictFile`；`buildMeta(dicts: DictFile[], renames): MetaIndex`；`DictFile` / `MetaIndex` 类型见 `src/types.ts`

- [ ] **Step 1: 定义共享类型**

`src/types.ts` 写入：`ParsedLine`、`DirectiveDoc`（`name/section/type/defaultValue/defaultSource/range/sensitive/modifiable/comment`）、`DictFile`（`line/tag/sections/directives`）、`MetaEntry`（`introducedIn/removedIn/renamedTo`）、`MetaIndex`（`Record<string, MetaEntry>`）、`Status`、`LineAnalysis`、`AnalysisResult`、`RiskWarning`、`PersistedState`。

- [ ] **Step 2: 写失败的测试**

`tests/build/build-dict.test.ts`：

```ts
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDictionary, buildMeta } from '../../scripts/build-dict.mjs';
import { parseConfigC } from '../../scripts/lib/parse-config-c.mjs';
import { parseOfficialConf } from '../../scripts/lib/parse-official-conf.mjs';

const fixture = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const dict = buildDictionary({
  line: '7.4', tag: '7.4.5',
  configC: parseConfigC(fixture('../fixtures/config-sample.c')),
  officialConf: parseOfficialConf(fixture('../fixtures/official-sample.conf')),
});
const byName = new Map(dict.directives.map((d: any) => [d.name, d]));

test('defaults come from config.c and comments from the conf', () => {
  expect(byName.get('maxclients')!.defaultValue).toBe('10000');
  expect(byName.get('maxclients')!.defaultSource).toBe('config.c');
  expect(byName.get('tcp-backlog')!.comment.length).toBeGreaterThan(0);
});

test('special directives take the last concrete commented value', () => {
  expect(byName.get('save')!.defaultValue).toBe('3600 1 300 100');
  expect(byName.get('save')!.defaultSource).toBe('conf-comment');
});

test('every directive is assigned to a section', () => {
  expect(byName.get('maxclients')!.section).toBe('NETWORK');
  expect(byName.get('save')!.section).toBe('SNAPSHOTTING');
});

test('meta records introduction and removal across lines', () => {
  const meta = buildMeta([dict, { ...dict, line: '8.0', directives: dict.directives.filter((d: any) => d.name !== 'tcp-backlog') }]);
  expect(meta['tcp-backlog'].removedIn).toBe('8.0');
  expect(meta['maxclients'].removedIn).toBeNull();
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/build/build-dict.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现构建**

规则：
1. 以 `config.c` 的条目为骨架；`section` 取该指令在官方 conf 中首次出现位置之前最近的分节；conf 里找不到的记为 `MISC`。
2. 默认值优先级：`defaults-override.json` > `config.c` > 官方 conf 的 `commentedValues` 最后一条 > `null`。来源写进 `defaultSource`。
3. `defaultValue === null` 的名字必须已登记在 `no-default.json`（初始为空数组 `[]`），否则 `buildDictionary` 抛错并列出这些名字——首次运行会失败，据此把真正无默认值的项补进 `no-default.json`，其余补进 `defaults-override.json`。
4. `buildMeta`：按 minor 线数字排序，`introducedIn` 取最早出现线；`removedIn` 取“存在之后第一个缺失的线”；`renamedTo` 从 `renames.json`（形如 `{ "hash-max-ziplist-entries": "hash-max-listpack-entries" }`）读取，引用了不存在的名字则抛错。
5. `scripts/build-dict.mjs` 主流程：读 `lock.json` 与 `data/upstream/<line>/`，逐线写 `src/data/dict/<line>.json`，最后写 `meta.json`；每线断言指令数 150–260、分节数 ≥ 8、`maxmemory`/`maxmemory-policy`/`protected-mode`/`appendonly`/`requirepass` 默认值非 `null`（`requirepass` 允许 `''`）。

- [ ] **Step 5: 运行测试与真实构建**

Run: `npx vitest run tests/build/build-dict.test.ts` → PASS
Run: `node scripts/build-dict.mjs`
Expected: 首次因 `no-default` 名单不全而失败并打印清单 → 把清单逐项归类后重跑 → 打印 10 行 `built <line> <count>`，`count` 均在 150–260

- [ ] **Step 6: 提交**

```bash
git add scripts src/types.ts src/data tests/build/build-dict.test.ts
git commit -m "feat: build per-line config dictionaries with cross-version meta index"
```

---

### Task 6: 用户 conf 解析器

**Files:**
- Create: `src/lib/parseConf.ts`
- Test: `tests/parseConf.test.ts`

**Interfaces:**
- Consumes: `ParsedLine`（Task 5）
- Produces: `parseConf(text: string): ParsedLine[]`；`tokenizeArgs(rest: string): { args: string[]; quoteStyles: QuoteStyle[] }`；`decodeConfBytes(bytes: ArrayBuffer): { text: string; warning: string | null }`

- [ ] **Step 1: 写失败的测试**

`tests/parseConf.test.ts`：

```ts
import { expect, test } from 'vitest';
import { parseConf, decodeConfBytes, tokenizeArgs } from '../src/lib/parseConf';

test('separates comments, blanks and directives', () => {
  const lines = parseConf('# c\n\nmaxmemory 100mb\n');
  expect(lines.map((l) => l.kind)).toEqual(['comment', 'blank', 'directive']);
  expect(lines[2].name).toBe('maxmemory');
  expect(lines[2].args).toEqual(['100mb']);
});

test('keeps a trailing hash as part of the value, never as a comment', () => {
  const [line] = parseConf('maxmemory 100mb # tmp');
  expect(line.kind).toBe('directive');
  expect(line.args).toEqual(['100mb', '#', 'tmp']);
});

test('tokenizes quoted passwords without exposing escapes', () => {
  const { args, quoteStyles } = tokenizeArgs('"p@ss \\"x\\"" plain');
  expect(args).toEqual(['p@ss "x"', 'plain']);
  expect(quoteStyles).toEqual(['double', 'plain']);
});

test('strips a UTF-8 BOM and normalises CRLF', () => {
  const bytes = new TextEncoder().encode('\uFEFFmaxclients 100\r\nbind 127.0.0.1\r\n');
  const { text, warning } = decodeConfBytes(bytes.buffer);
  expect(warning).toBeNull();
  expect(parseConf(text).filter((l) => l.kind === 'directive').length).toBe(2);
  expect(text.includes('\r')).toBe(false);
});

test('marks template lines from documentation as unknown', () => {
  const [line] = parseConf('maxmemory <bytes>');
  expect(line.kind).toBe('unknown');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/parseConf.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- `decodeConfBytes`：`TextDecoder('utf-8', { fatal: false })` 解码，去掉开头的 `\uFEFF`，`\r\n`/`\r` 统一为 `\n`；若解码结果中 `\uFFFD` 占比超过 0.5% 则返回 `warning: '文件可能不是 UTF-8 编码，请确认内容是否乱码'`。
- `parseConf`：按 `\n` 切行（保留原 `raw`，`lineNo` 从 1 开始）；`trimStart()` 后以 `#` 开头为 comment，空串为 blank；首个 token 不匹配 `^[A-Za-z][A-Za-z0-9-]*$` 或该行含 `<`/`>` 时为 unknown；否则为 directive，`args` 与 `quoteStyles` 来自 `tokenizeArgs`。
- `tokenizeArgs`：仅处理引号与 `\"` `\\` 转义，不做行尾注释剥离。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/parseConf.test.ts`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/parseConf.ts tests/parseConf.test.ts
git commit -m "feat: parse user redis.conf preserving quotes and raw lines"
```

---

### Task 7: 值归一化

**Files:**
- Create: `src/lib/normalize.ts`
- Test: `tests/normalize.test.ts`

**Interfaces:**
- Consumes: `DirectiveDoc`（Task 5）、`tokenizeArgs`（Task 6）
- Produces: `normalizeValue(doc: DirectiveDoc | undefined, args: string[]): string`；`formatBytes(bytes: number): string`；`parseMemory(token: string): number | null`

- [ ] **Step 1: 写失败的测试**

`tests/normalize.test.ts`：

```ts
import { expect, test } from 'vitest';
import { formatBytes, normalizeValue, parseMemory } from '../src/lib/normalize';

const doc = (type: string, defaultValue: string | null = null) => ({ type, defaultValue } as any);

test('memory units compare by bytes', () => {
  expect(parseMemory('1gb')).toBe(1073741824);
  expect(parseMemory('1024mb')).toBe(1073741824);
  expect(formatBytes(1073741824)).toBe('1gb');
});

test('maxmemory 1gb equals a dictionary default of 1024mb', () => {
  expect(normalizeValue(doc('ulonglong', '1024mb'), ['1gb'])).toBe(normalizeValue(doc('ulonglong', '1024mb'), ['1024mb']));
});

test('enum and bool values are case insensitive', () => {
  expect(normalizeValue(doc('enum'), ['NoEviction'])).toBe(normalizeValue(doc('enum'), ['noeviction']));
  expect(normalizeValue(doc('bool'), ['YES'])).toBe(normalizeValue(doc('bool'), ['yes']));
});

test('whitespace and quote styles do not matter for plain strings', () => {
  expect(normalizeValue(doc('sds', ''), ['  "a  b"  '])).toBe('a b');
});

test('empty arg list normalises to empty string', () => {
  expect(normalizeValue(doc('string', ''), [])).toBe('');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/normalize.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- `parseMemory`：`^\s*(\d+(?:\.\d+)?)\s*(b|k|kb|m|mb|g|gb|t|tb)?\s*$`（大小写不敏感，`k`=`kb`=1024，依此类推）；无单位按字节。
- `formatBytes`：从 `tb` 向下找到第一个能整除的单位；全部不能整除时输出 `${bytes}b`；0 输出 `0`。
- `normalizeValue`：拆分并去引号 → 压缩空白 → 若 `doc.type` 为数值型且带 `MEMORY_CONFIG` 语义（`ulonglong`/`size_t` 且 token 能 `parseMemory`）则统一转成字节字符串；否则 enum/bool 小写、其他保持小写化后的原文；多个参数用单个空格连接。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/normalize.test.ts`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/normalize.ts tests/normalize.test.ts
git commit -m "feat: normalise directive values for default comparison"
```

---

### Task 8: 分析器

**Files:**
- Create: `src/lib/analyze.ts`
- Test: `tests/analyze.test.ts`

**Interfaces:**
- Consumes: `parseConf`（Task 6）、`normalizeValue`（Task 7）、`DictFile`/`MetaIndex`/`AnalysisResult`（Task 5）
- Produces: `analyze(lines: ParsedLine[], dict: DictFile, meta: MetaIndex, line: string, aliases: Record<string, string>): AnalysisResult`；`AnalysisResult` 含 `lines`、`byLine: Map<number, LineAnalysis>`、`counts`、`missing: string[]`、`firstLineOf: Map<string, number>`、`effective: Map<string, string[]>`

- [ ] **Step 1: 写失败的测试**

`tests/analyze.test.ts`：

```ts
import { expect, test } from 'vitest';
import { parseConf } from '../src/lib/parseConf';
import { analyze } from '../src/lib/analyze';

const doc = (name: string, defaultValue: string | null, type = 'string') =>
  ({ name, section: 'NETWORK', type, defaultValue, defaultSource: 'config.c', range: null, sensitive: false, modifiable: true, comment: [] });
const dict = {
  line: '7.4', tag: '7.4.5', sections: [{ id: 'NETWORK', title: 'NETWORK' }],
  directives: [doc('maxclients', '10000'), doc('maxmemory', '0', 'ulonglong'), doc('save', '3600 1', 'special')],
} as any;
const meta = {} as any;
const run = (text: string) => analyze(parseConf(text), dict, meta, '7.4', { slaveof: 'replicaof' });

test('default and changed are distinguished', () => {
  const r = run('maxclients 10000\nmaxclients 500\n');
  expect(r.byLine.get(1)!.status).toBe('default');
  expect(r.byLine.get(2)!.status).toBe('changed');
});

test('unknown names are reported', () => {
  expect(run('whatever-enabled yes').byLine.get(1)!.status).toBe('unknown');
});

test('repeated save is not a duplicate, repeated maxclients is', () => {
  const save = run('save 3600 1\nsave 300 100\n');
  expect(save.counts.duplicate).toBe(0);
  const dup = run('maxclients 1\nmaxclients 2\n');
  expect(dup.counts.duplicate).toBe(1);
  expect(dup.byLine.get(2)!.status).toBe('duplicate');
});

test('include and loadmodule are special, never unknown', () => {
  const r = run('include /etc/redis/local.conf\nloadmodule /opt/m.so\n');
  expect(r.byLine.get(1)!.status).toBe('special');
  expect(r.byLine.get(2)!.status).toBe('special');
  expect(r.counts.unknown).toBe(0);
});

test('an empty file yields zero counts and a steady missing list', () => {
  const r = run('');
  expect(r.counts.changed + r.counts.unknown + r.counts.duplicate).toBe(0);
  expect(r.missing).toContain('maxmemory');
});

test('effective values fall back to defaults when the line is absent', () => {
  const r = run('maxmemory-policy allkeys-lru\n');
  expect(r.effective.get('maxmemory')![0]).toBe('0');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/analyze.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- 查表：当前 dict → `aliases` → `meta`（有 `removedIn <= 目标线` 则 `removed`，`introducedIn > 目标线` 则 `newer`）→ `unknown`。
- `special` 名单：`include`、`loadmodule`、`rename-command`、`aclfile`、`user`。
- 判等：`normalizeValue(doc, args) === normalizeValue(doc, tokenizeArgs(doc.defaultValue ?? '').args)`；`defaultValue === null` → `no-default`。
- 重复：统计每个名字出现次数，`doc.modifiable` 为 true 且非 `multiArg`（`save`、`client-output-buffer-limit`）时，第 2 次及以后标 `duplicate`。
- `effective`：每个名字最终的显式值（多值取最后一条）否则 `tokenizeArgs(doc.defaultValue ?? '')`。
- `missing`：`['maxmemory','maxmemory-policy','appendonly','save','protected-mode','bind']` 中无显式行的项。
- 计数不含 `default`/`no-default`/`special`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/analyze.test.ts`
Expected: 6 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/analyze.ts tests/analyze.test.ts
git commit -m "feat: analyse conf lines against dictionary and defaults"
```

---

### Task 9: 风险规则

**Files:**
- Create: `src/lib/risks.ts`、`src/data/risk-rules.json`
- Test: `tests/risks.test.ts`

**Interfaces:**
- Consumes: `AnalysisResult`（Task 8）
- Produces: `evaluateRisks(result: AnalysisResult, dict: DictFile): RiskWarning[]`；`RiskWarning = { id: string; level: 'high' | 'medium' | 'low'; message: string; lineNos: number[]; source: 'explicit' | 'default' }`

- [ ] **Step 1: 写失败的测试**

`tests/risks.test.ts`：

```ts
import { expect, test } from 'vitest';
import { parseConf } from '../src/lib/parseConf';
import { analyze } from '../src/lib/analyze';
import { evaluateRisks } from '../src/lib/risks';
import { readFileSync } from 'node:fs';

const dict = JSON.parse(readFileSync(new URL('../tests/fixtures/dict-small.json', import.meta.url), 'utf8'));
const run = (text: string) => evaluateRisks(analyze(parseConf(text), dict, {}, '7.4', {}), dict);

test('protected-mode no without a password is high risk', () => {
  const [w] = run('protected-mode no\n');
  expect(w.id).toBe('no-auth-protected-mode-off');
  expect(w.level).toBe('high');
  expect(w.source).toBe('explicit');
});

test('a warning driven by a default value says so', () => {
  const w = run('maxmemory-policy allkeys-lru\n').find((x) => x.id === 'policy-without-limit');
  expect(w!.source).toBe('default');
});

test('no persistence is high risk', () => {
  expect(run('appendonly no\nsave ""\n').some((w) => w.id === 'no-persistence')).toBe(true);
});

test('an empty file raises no rule that needs an explicit line', () => {
  expect(run('').filter((w) => w.source === 'explicit')).toEqual([]);
});
```

同时创建 `tests/fixtures/dict-small.json`：只含 `maxmemory`(0)、`maxmemory-policy`(noeviction)、`appendonly`(no)、`save`(3600 1)、`protected-mode`(yes)、`requirepass`('')、`bind`(127.0.0.1)、`appendfsync`(everysec)、`daemonize`(no)、`logfile`('')、`replica-read-only`(yes)、`cluster-enabled`(no)、`cluster-config-file` 的字典。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/risks.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/data/risk-rules.json` 只放 `{ id, level, message }`（文案里用 `{{值}}` 占位），`risks.ts` 用一张 `id → 判定函数(effective, firstLineOf)` 的表实现 10 条规则（见 spec 6.5），产出 `source`：该指令有显式行则 `explicit`，否则 `default`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/risks.test.ts`
Expected: 4 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/risks.ts src/data/risk-rules.json tests/risks.test.ts tests/fixtures/dict-small.json
git commit -m "feat: evaluate effective-config risk rules"
```

---

### Task 10: 密码占位符

**Files:**
- Create: `src/lib/secrets.ts`
- Test: `tests/secrets.test.ts`

**Interfaces:**
- Consumes: `ParsedLine`（Task 6）
- Produces: `replaceSecrets(text: string): { text: string; vault: Map<string, string>; found: number }`；`restoreSecrets(text: string, vault: Map<string, string>): string`；`hasPlaceholder(text: string): boolean`；`SENSITIVE_NAMES`（含 `user` 的 `>pass` 识别）

- [ ] **Step 1: 写失败的测试**

`tests/secrets.test.ts`：

```ts
import { expect, test } from 'vitest';
import { replaceSecrets, restoreSecrets, hasPlaceholder } from '../src/lib/secrets';

test('requirepass value is replaced by an env placeholder and remembered in memory', () => {
  const r = replaceSecrets('requirepass "s3cr3t"\n');
  expect(r.text).toBe('requirepass ${env_requirepass}\n');
  expect(r.found).toBe(1);
  expect(restoreSecrets(r.text, r.vault)).toBe('requirepass "s3cr3t"\n');
});

test('masterauth and tls key pass are covered too', () => {
  const r = replaceSecrets('masterauth oldpass\ntls-key-file-pass "k"\n');
  expect(r.text).toContain('${env_masterauth}');
  expect(r.text).toContain('${env_tls-key-file-pass}');
});

test('acl user passwords are replaced but the username is kept', () => {
  const r = replaceSecrets('user default on >mypass ~* &* +@all\n');
  expect(r.text.startsWith('user default on ${env_user-pass}')).toBe(true);
  expect(r.text).not.toContain('mypass');
});

test('running twice does not double-replace', () => {
  const once = replaceSecrets('requirepass a\n').text;
  expect(replaceSecrets(once).found).toBe(0);
});

test('detects placeholders for the export menu', () => {
  expect(hasPlaceholder('masterauth ${env_masterauth}\n')).toBe(true);
  expect(hasPlaceholder('maxmemory 0\n')).toBe(false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/secrets.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

逐行处理 directive：名字在 `SENSITIVE_NAMES`（`requirepass`、`masterauth`、`tls-key-file-pass`、`tls-client-key-file-pass`）时，用 `tokenizeArgs` 得到参数，保留首个参数之前的原始前缀，把「第一个参数」替换为 `${env_<name>}`；`user` 行则只替换以 `>` 开头的参数。vault key 用 `${name}#${序号}`，重复值按出现顺序编号。已是占位符的行跳过。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/secrets.test.ts`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/secrets.ts tests/secrets.test.ts
git commit -m "feat: replace secrets with env placeholders, keep originals in memory only"
```

---

### Task 11: 词典运行时加载、搜索与插入

**Files:**
- Create: `src/lib/dict.ts`、`src/lib/search.ts`、`src/data/aliases.ts`、`src/data/zh-notes.json`
- Test: `tests/search.test.ts`

**Interfaces:**
- Consumes: `DictFile`/`MetaIndex`（Task 5）、`ParsedLine`（Task 6）
- Produces: `loadDict(line: string): Promise<DictFile>`；`loadMeta(): Promise<MetaIndex>`；`searchDirectives(dict: DictFile, query: string, configured: Set<string>): SearchHit[]`；`insertDirective(text: string, lines: ParsedLine[], doc: DirectiveDoc, dict: DictFile): { text: string; lineNo: number }`；`SearchHit = { name: string; section: string; summary: string | null; defaultValue: string | null; configured: boolean }`

- [ ] **Step 1: 写失败的测试**

`tests/search.test.ts`：

```ts
import { expect, test } from 'vitest';
import { searchDirectives, insertDirective } from '../src/lib/search';
import { parseConf } from '../src/lib/parseConf';
import { readFileSync } from 'node:fs';

const dict = JSON.parse(readFileSync(new URL('./fixtures/dict-small.json', import.meta.url), 'utf8'));

test('matches by name, case insensitive', () => {
  expect(searchDirectives(dict, 'MAXMEM', new Set()).map((h) => h.name)).toContain('maxmemory');
});

test('matches by chinese summary', () => {
  const hits = searchDirectives(dict, '最大连接', new Set());
  expect(hits.map((h) => h.name)).toContain('maxclients');
});

test('marks already configured directives', () => {
  expect(searchDirectives(dict, 'maxmemory', new Set(['maxmemory']))[0].configured).toBe(true);
});

test('inserts a missing directive inside its own section', () => {
  const text = '################ NETWORK ################\nmaxclients 500\n\n################ SNAPSHOTTING ################\nsave 3600 1\n';
  const doc = dict.directives.find((d: any) => d.name === 'bind');
  const out = insertDirective(text, parseConf(text), doc, dict);
  const lines = out.text.split('\n');
  expect(lines[out.lineNo - 1].startsWith('bind ')).toBe(true);
  expect(out.text.indexOf('bind ')).toBeLessThan(out.text.indexOf('save 3600 1'));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/search.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- `loadDict`/`loadMeta` 用 `import.meta.glob('../data/dict/*.json')`（`eager: false`）按文件名取，`meta.json` 单独取；结果做内存缓存。
- 搜索：名称/中文摘要/英文注释三处子串匹配（小写化），按「名称命中 > 摘要命中 > 注释命中」排序，最多 50 条。
- 插入：在用户文本中找「所属分节内最后一条指令行」的下一行；若用户文本里没有该分节的任何指令，按 `dict.sections` 顺序插到第一个更靠后的分节之前；插到末尾时保证前置一个空行。插入内容为 `name + ' ' + defaultValue`（默认值 `null` 时用 `# name <...>` 模板并作为注释行）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/search.test.ts`
Expected: 4 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/dict.ts src/lib/search.ts src/data/aliases.ts src/data/zh-notes.json tests/search.test.ts
git commit -m "feat: load dictionaries lazily, search directives and insert missing ones"
```

---

### Task 12: 三种导出

**Files:**
- Create: `src/lib/exportConf.ts`
- Test: `tests/exportConf.test.ts`

**Interfaces:**
- Consumes: `ParsedLine`（Task 6）、`DirectiveDoc`/`DictFile`（Task 5）、`restoreSecrets`（Task 10）
- Produces: `exportOriginal(text: string): string`；`exportWithComments(lines: ParsedLine[], dict: DictFile): string`；`exportWithSecrets(text: string, vault: Map<string, string>): string`；`suggestFileName(name: string | null): string`

- [ ] **Step 1: 写失败的测试**

`tests/exportConf.test.ts`：

```ts
import { expect, test } from 'vitest';
import { exportOriginal, exportWithComments, suggestFileName } from '../src/lib/exportConf';
import { parseConf } from '../src/lib/parseConf';
import { readFileSync } from 'node:fs';

const dict = JSON.parse(readFileSync(new URL('./fixtures/dict-small.json', import.meta.url), 'utf8'));

const commented = (name: string) => dict.directives.find((d: any) => d.name === name)?.comment?.length > 0;

test('original export only normalises line endings and keeps one trailing newline', () => {
  expect(exportOriginal('a 1\r\nb 2\r\n\r\n')).toBe('a 1\nb 2\n\n');
});

test('comment export leaves already documented lines alone', () => {
  const text = '# I wrote this\nmaxclients 500\n';
  const out = exportWithComments(parseConf(text), dict);
  expect(out).toBe(text);
});

test('comment export adds official text plus the default value line', () => {
  const out = exportWithComments(parseConf('maxmemory 1gb\n'), dict);
  expect(out).toContain('# 默认值: 0');
  expect(out).toContain('maxmemory 1gb');
});

test('comment export is idempotent', () => {
  const once = exportWithComments(parseConf('maxmemory 1gb\n'), dict);
  expect(exportWithComments(parseConf(once), dict)).toBe(once);
});

test('suggests a download name', () => {
  expect(suggestFileName('redis.prod.conf')).toBe('redis.prod-edited.conf');
  expect(suggestFileName(null)).toBe('redis-edited.conf');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/exportConf.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- `exportOriginal`：`text.replace(/\r\n?/g, '\n')`，去掉末尾多余空行后补一个 `\n`。
- `exportWithComments`：遍历 `lines`，对 `directive` 且字典有 `comment` 且其上方紧邻行不是 `comment` 的行，插入 `# ` 前缀的注释块 + `# 默认值: X`（`defaultValue === null` 时写 `# 默认值: 官方未给出`）；其余行原样输出；行尾统一 LF；本身已是 `# 默认值:` 或官方注释块的行不再重复插入。
- `exportWithSecrets`：调用 `restoreSecrets`；占位符找不到原值时原样保留。
- `suggestFileName`：把 `.conf` 前缀加 `-edited`，无名字时 `redis-edited.conf`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/exportConf.test.ts`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/exportConf.ts tests/exportConf.test.ts
git commit -m "feat: export conf in three modes with idempotent comment completion"
```

---

### Task 13: 界面骨架（工具栏、摘要条、问题列表）

**Files:**
- Create: `src/App.tsx`（替换）、`src/components/Toolbar.tsx`、`src/components/SummaryBar.tsx`、`src/components/IssueList.tsx`、`src/lib/sample.ts`
- Test: `tests/summaryBar.test.tsx`

**Interfaces:**
- Consumes: `parseConf`、`analyze`、`evaluateRisks`、`replaceSecrets`（Tasks 6–10）
- Produces: `<App />` 持有 `text`、`line`、`vault`、`analysis` 状态；`SummaryBar` props `{ counts: AnalysisResult['counts']; missing: string[]; onJump: (kind: string) => void }`；`IssueList` props `{ result: AnalysisResult; warnings: RiskWarning[]; onJump: (lineNo: number) => void }`

- [ ] **Step 1: 写失败的测试**

`tests/summaryBar.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { SummaryBar } from '../src/components/SummaryBar';

test('shows each count and the missing list', () => {
  render(<SummaryBar counts={{ changed: 3, unknown: 2, removed: 0, newer: 0, duplicate: 0 }} missing={['maxmemory']} onJump={() => {}} />);
  expect(screen.getByText('已改 3')).toBeInTheDocument();
  expect(screen.getByText('未知 2')).toBeInTheDocument();
  expect(screen.getByText('缺失: maxmemory')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/summaryBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

- `Toolbar`：版本下拉（10 条线）、上传按钮、清空、`⌘K 搜索`、内联注释三档下拉、只看差异开关、导出下拉、中文摘要开关、帮助链接；全部通过 props 回调。
- `SummaryBar`：渲染 `已改 N · 未知 N · 已移除 N · 告警 N · 重复 N · 缺失: …`，每项可点击。
- `IssueList`：合并「未知/已移除/版本不支持/重复」与风险告警，按行号排序，点击跳转。
- `App`：启动时 `loadDict('7.4')`，`useMemo` 计算 `parseConf → analyze → evaluateRisks`；`text` 变更时重建分析；`sample.ts` 导出不含密码的示例文本。
- 布局：`min-w-[1024px]`，顶部工具栏、摘要条，下方左右两栏（编辑器 62% / 详情 38%）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/summaryBar.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/App.tsx src/components src/lib/sample.ts tests/summaryBar.test.tsx
git commit -m "feat: app shell with toolbar, summary bar and issue list"
```

---

### Task 14: 编辑器、状态标记、内联注释与只看差异

**Files:**
- Create: `src/components/Editor.tsx`、`src/components/AnnotationLayer.tsx`、`src/lib/annotations.ts`、`src/lib/editorTheme.ts`
- Test: `tests/annotations.test.ts`

**Interfaces:**
- Consumes: `ParsedLine`、`LineAnalysis`、`DirectiveDoc`
- Produces: `buildAnnotationBlocks(lines: ParsedLine[], byLine: Map<number, LineAnalysis>, mode: 'missing' | 'all' | 'off'): AnnotationBlock[]`，`AnnotationBlock = { atLineNo: number; name: string; text: string[] }`；`statusClass(status: Status): string`；`<Editor value onChange onCursorLine annotationMode onlyDiff />`

- [ ] **Step 1: 写失败的测试**

`tests/annotations.test.ts`：

```ts
import { expect, test } from 'vitest';
import { buildAnnotationBlocks } from '../src/lib/annotations';
import { parseConf } from '../src/lib/parseConf';

const doc = (name: string) => ({ name, section: 'NETWORK', type: 'string', defaultValue: '10000', defaultSource: 'config.c', range: null, sensitive: false, modifiable: true, comment: ['line one', 'line two'] });
const byLine = new Map([
  [3, { lineNo: 3, status: 'changed', doc: doc('maxclients') }],
  [5, { lineNo: 5, status: 'default', doc: doc('maxmemory') }],
] as any);

test('missing mode skips directives that already have a comment above', () => {
  const lines = parseConf('# mine\nmaxclients 500\n\nmaxmemory 0\n');
  const blocks = buildAnnotationBlocks(lines, byLine, 'missing');
  expect(blocks.map((b) => b.atLineNo)).toEqual([4]);
});

test('all mode annotates every known directive', () => {
  const lines = parseConf('# mine\nmaxclients 500\n\nmaxmemory 0\n');
  expect(buildAnnotationBlocks(lines, byLine, 'all').length).toBe(2);
});

test('off mode yields nothing', () => {
  expect(buildAnnotationBlocks(parseConf('maxclients 500\n'), byLine, 'off')).toEqual([]);
});

test('block text ends with the default value line', () => {
  const [block] = buildAnnotationBlocks(parseConf('maxclients 500\n'), byLine, 'all');
  expect(block.text.at(-1)).toBe('默认值: 10000');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/annotations.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- `annotations.ts` 按上述规则生成块（`missing` 模式判断指令行上方紧邻行是否 `comment`）。
- `editorTheme.ts`：为每个状态定义行类名 `cm-status-changed|unknown|removed|newer|duplicate|warning`，CSS 里用左边框色 + 行首圆点（`::before`）表达，不引入 gutter 扩展。
- `Editor.tsx`：CodeMirror 6 `EditorView`，扩展 `basicSetup` 的最小集（lineNumbers、history、keymap）、`EditorView.updateListener` 上报光标行、`ViewPlugin` 每帧重算行装饰与块装饰；`onlyDiff` 为真时给无问题行加 `cm-hide-line`（`display: none`）。
- `AnnotationLayer.tsx`：把 `AnnotationBlock` 转成 `Decoration.widget({ block: true, side: -1 })`，块内渲染注释文本 + 「写入文本」按钮（调用 `onCommitComment(atLineNo, text)`，由 App 把注释行插进文档）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/annotations.test.ts`
Expected: 4 passed

- [ ] **Step 5: 浏览器验证**

Run: `npm run dev`，用浏览器打开 → 贴入示例 → 三种内联注释模式切换、只看差异折叠、光标驱动右侧行号。人工确认后继续。

- [ ] **Step 6: 提交**

```bash
git add src/components/Editor.tsx src/components/AnnotationLayer.tsx src/lib/annotations.ts src/lib/editorTheme.ts src/index.css tests/annotations.test.ts
git commit -m "feat: editor with status decorations, inline official comments and diff-only view"
```

---

### Task 15: 详情面板

**Files:**
- Create: `src/components/DetailPanel.tsx`、`src/lib/describe.ts`、`src/data/zh-notes.json`
- Test: `tests/describe.test.ts`

**Interfaces:**
- Consumes: `DirectiveDoc`、`LineAnalysis`
- Produces: `describeDirective(doc: DirectiveDoc | undefined, current: LineAnalysis | undefined, zhNotes: Record<string, string>, showZh: boolean): DetailView`；`DetailView = { name: string; section: string | null; defaultText: string; rangeText: string | null; statusText: string; body: string[]; docUrl: string }`

- [ ] **Step 1: 写失败的测试**

`tests/describe.test.ts`：

```ts
import { expect, test } from 'vitest';
import { describeDirective } from '../src/lib/describe';

const doc = { name: 'maxmemory', section: 'MEMORY', type: 'ulonglong', defaultValue: '0', defaultSource: 'config.c', range: null, sensitive: false, modifiable: true, comment: ['Set a memory usage limit.'] };

test('shows section, default and status', () => {
  const v = describeDirective(doc as any, { lineNo: 3, status: 'changed', doc: doc as any }, {}, false);
  expect(v.section).toBe('MEMORY');
  expect(v.defaultText).toBe('0');
  expect(v.statusText).toBe('已改');
});

test('unknown directives explain themselves without crashing', () => {
  const v = describeDirective(undefined, { lineNo: 9, status: 'unknown' }, {}, false);
  expect(v.statusText).toContain('未知');
  expect(v.body.length).toBeGreaterThan(0);
});

test('chinese summary is shown first when enabled', () => {
  const v = describeDirective(doc as any, undefined, { maxmemory: '内存上限' }, true);
  expect(v.body[0]).toBe('内存上限');
});

test('missing default is phrased clearly', () => {
  const v = describeDirective({ ...doc, defaultValue: null } as any, undefined, {}, false);
  expect(v.defaultText).toContain('官方未给出');
});

test('empty line yields an empty view', () => {
  expect(describeDirective(undefined, undefined, {}, false).name).toBe('');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/describe.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`DetailPanel` 渲染 `DetailView`：标题、`分节 · 第 N 行`、`默认值` 与当前值对比、范围、状态徽章、中文摘要（可选）、官方注释（可折叠、可复制）、`插入默认值到本行` 按钮、官方文档链接 `https://redis.io/docs/latest/operate/oss_and_stack/management/config/`；空行显示占位文案。`zh-notes.json` 写约 40 条一句话摘要（`maxmemory` 等高频项）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/describe.test.ts`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/components/DetailPanel.tsx src/lib/describe.ts src/data/zh-notes.json tests/describe.test.ts
git commit -m "feat: detail panel describing directives with chinese summaries"
```

---

### Task 16: 搜索面板、导出接线、持久化与空状态

**Files:**
- Create: `src/components/SearchPalette.tsx`、`src/components/ExportMenu.tsx`、`src/components/EmptyState.tsx`、`src/lib/persistence.ts`
- Modify: `src/App.tsx`
- Test: `tests/persistence.test.ts`

**Interfaces:**
- Consumes: `searchDirectives`/`insertDirective`（Task 11）、三种导出（Task 12）、`replaceSecrets`（Task 10）
- Produces: `saveState(state: PersistedState): void`；`loadState(): PersistedState | null`；`STORAGE_KEY = 'zilucid:state'`；`PersistedState = { v: 1; line: string; text: string; annotationMode: 'missing' | 'all' | 'off'; onlyDiff: boolean; showZh: boolean }`

- [ ] **Step 1: 写失败的测试**

`tests/persistence.test.ts`：

```ts
import { beforeEach, expect, test } from 'vitest';
import { loadState, saveState } from '../src/lib/persistence';

beforeEach(() => localStorage.clear());

test('round trips version, toggles and text', () => {
  saveState({ v: 1, line: '7.4', text: 'maxmemory 0\n', annotationMode: 'missing', onlyDiff: false, showZh: true });
  expect(loadState()).toEqual({ v: 1, line: '7.4', text: 'maxmemory 0\n', annotationMode: 'missing', onlyDiff: false, showZh: true });
});

test('never writes plaintext passwords', () => {
  saveState({ v: 1, line: '7.4', text: 'requirepass ${env_requirepass}\n', annotationMode: 'all', onlyDiff: true, showZh: false });
  expect(JSON.stringify(localStorage.getItem('zilucid:state'))).not.toContain('requirepass ');
  expect(localStorage.getItem('zilucid:state')).not.toContain('requirepass s3cr3t');
});

test('invalid or absent state returns null', () => {
  localStorage.setItem('zilucid:state', '{oops');
  expect(loadState()).toBeNull();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/persistence.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- `persistence.ts`：`JSON.stringify` 写入单个 key；`loadState` 捕获解析异常返回 `null`；写入前断言 `text` 不含 `SENSITIVE_NAMES` 后跟非 `${env_` 的字面量值，命中则抛错（开发期护栏）。
- `SearchPalette`：`⌘K`/`Ctrl+K` 打开，输入过滤，左侧分节列表，选中已有项跳转、未配置项调用 `insertDirective` 后把光标移到插入行。
- `ExportMenu`：三项导出；「还原密码导出」仅当 `vault.size > 0` 可用，点击先弹 `confirm('导出的文件将包含明文密码，确认？')`；导出用 `Blob` + `a[download]`，文件名来自 `suggestFileName`。
- `EmptyState`：粘贴区提示 + 「载入示例配置」按钮；上传用 `<input type="file" accept=".conf,.config,.txt">`，走 `decodeConfBytes`，有 `warning` 时在摘要条上方显示。
- `App.tsx` 接线：初始化 `loadState()` 恢复；`text`/开关变化时 `saveState`；`onDrop` 支持拖拽文件；导入文本先 `replaceSecrets` 再进编辑器。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/persistence.test.ts`
Expected: 3 passed

- [ ] **Step 5: 提交**

```bash
git add src/components/SearchPalette.tsx src/components/ExportMenu.tsx src/components/EmptyState.tsx src/lib/persistence.ts src/App.tsx tests/persistence.test.ts
git commit -m "feat: search palette, export menu, persistence and empty state"
```

---

### Task 17: README、离线验证与整体冒烟

**Files:**
- Create: `README.md`
- Modify: `src/App.tsx`（如冒烟发现缺陷）

**Interfaces:**
- Consumes: 全部
- Produces: 可交付的仓库

- [ ] **Step 1: 跑全量测试**

Run: `npx vitest run`
Expected: 全部 PASS（约 12 个测试文件）

- [ ] **Step 2: 构建并验证离线可用**

Run: `npm run build`
Expected: `dist/` 生成；`dist/index.html` 中引用为 `./assets/...`；双击打开后能载入示例、切换版本、导出文件。

- [ ] **Step 3: 端到端冒烟（浏览器）**

1. 打开 `dist/index.html`；
2. 载入示例配置 → 摘要条显示非零「已改」，右侧详情正常；
3. 切换 10 个版本，确认字典能加载、无报错；
4. `Ctrl+K` 搜 `maxmemory` → 插入到 MEMORY 分节；再搜 `save` 确认已存在项能跳转；
5. 内联注释三档切换正常，「写入文本」后注释成为真实行；
6. 三种导出各下一次，检查：原样导出保留用户注释、补全注释导出不重复、还原密码导出含原文；
7. 刷新页面，确认文本与开关被恢复、页面无明文密码。

- [ ] **Step 4: 写 README**

包含：项目一句话介绍、截图占位、「在线使用 / 本地离线使用」两条路径、`npm run dev` / `npm run build`、数据更新流程（`node scripts/fetch-upstream.mjs && node scripts/build-dict.mjs`）、隐私说明（纯前端、密码占位符、Redis 不解析环境变量）。

- [ ] **Step 5: 提交**

```bash
git add README.md src dist 2>/dev/null || git add README.md src
git commit -m "docs: add readme and verify offline build"
```

---

## 自检记录

- **Spec 覆盖**：6.1 技术形态 → Task 1/14；6.2 字典生成 → Task 2/3/4/5；6.3 解析 → Task 6；6.4 分析 → Task 7/8；6.5 风险 → Task 9；6.6 界面与密码 → Task 10/13/14/15/16；6.7 导出 → Task 12/16；6.8 部署 → Task 1/17；第 8 节验证 → Task 17 与各任务测试。
- **Review Focus 对位**：行尾 `#` → Task 6；CRLF/BOM → Task 6 + Task 12；空文件 → Task 8；重复指令 → Task 8；`include`/`loadmodule` → Task 8。
- **类型一致性**：`ParsedLine`/`DirectiveDoc`/`DictFile`/`MetaIndex`/`AnalysisResult`/`RiskWarning`/`PersistedState` 均在 Task 5 的 `src/types.ts` 定义，后续任务只引用。
- **已知偏离 spec**：spec 6.2 说 `meta.json` 含 `renamedTo`，本计划改由 `src/data/renames.json` 提供并在构建时并入 `meta.json`，运行期结构不变。
