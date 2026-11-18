# v2：官方版本来源与 IDEA 式配置 diff 设计

日期：2026-11-17
状态：已实现
范围：本次只做「版本来源改造 + diff 体验重做」；推荐配置生成推到下一版本。

## 1. 意图：为什么做

现在的工具已经能逐项判断「改没改 / 默认值多少 / 是否废弃」，但底部「配置对比」仍是一张
单表：一行一个指令，左右信息挤在一起，看不出「从你的值变成官方值」的方向感。用户明确
要求像 IDEA 的并排 diff 那样，左右两栏、双行号、中间箭头、红绿整行、词级高亮。

同时，版本清单目前由 GitHub tags 推导、下拉只显示 `7.4` 这样的线号。用户希望它更像
「官网发布的版本」：能看到具体 patch 和发布日期，知道自己在对照哪一份正式版本。

## 2. 目标

- 底部「配置对比」变成按指令名对齐的并排 diff，视觉与交互向 IDEA 看齐。
- diff 右侧是「官方默认值精简版」，不是 2300 行带注释的官方原文。
- 版本清单来自 GitHub Releases 的正式版（非 draft、非 prerelease），每个 minor 线取
  最新 patch，并显示发布日期。
- 全部逻辑仍是浏览器内纯函数，运行时不请求外部网络。

## 3. 非目标 / 反目标

非目标（本次不做）：

- 不做推荐配置生成（服务器选型、单机/哨兵/Cluster），下一版本再做。
- 不做两份用户 conf 的任意 diff，也不做「修改前 vs 修改后」快照 diff。
- 不把 200+ 条官方默认项全部铺进 diff 右侧。
- 不改上方左右编辑器的布局与职责。
- 不引入新的 diff 库或编辑器依赖。

反目标（做了也算失败）：

- diff 里出现大段注释、空行，导致真正的差异被淹没。
- 右侧默认值把用户没写的 180 多项全部标成「新增」，变成噪声墙。
- 箭头能点但行为不可预期（例如点一下悄悄改动多行、或改变行数）。
- 版本下拉显示 rc 版本，或日期与 tag 对不上。

## 4. 已选方案

对话中确认：**A —— 指令语义对齐的并排 diff**。

| 方案 | 说明 | 结论 |
|---|---|---|
| A | 单滚动容器、五列对齐行，按指令名配对，token 级高亮，未改行折叠 | 采用 |
| B | 左右双 CodeMirror，按原始文本行 diff，右侧用官方完整 conf | 放弃：注释与空行淹没差异，接不上废弃/重复/别名判断 |
| C | 现有表格加箭头与词级高亮 | 放弃：本质仍是表格，不是并排 diff |

## 5. 版本来源改造

### 5.1 数据源

`scripts/fetch-upstream.mjs` 改用 GitHub Releases：

- 请求 `https://api.github.com/repos/redis/redis/releases?per_page=100&page=1..3`。
- 只保留 `draft === false`、`prerelease === false`、tag 匹配 `^\d+\.\d+\.\d+$` 的项。
- 按 `major.minor` 分组，取 patch 最大的一条。
- `data/versions.json` 继续作为「支持的 minor 线白名单」：只有白名单里的线才写入，
  避免自动混入 9.0 之类尚未决定支持的线。
- 记录 `{ tag, publishedAt }`，其中 `publishedAt` 取 release 的 `published_at`，UI 只显示
  日期部分（`YYYY-MM-DD`）。
- API 失败时沿用 `data/upstream/lock.json` 里的上次结果，保证构建可离线复现。
- **tag 变化必须重下上游文件**：`saveLine` 不能只看文件是否存在。先比较
  `lock[line].tag` 与本次解析出的 tag，不同则强制重新下载 `redis.conf` 与 `config.c`，
  避免字典内容是旧 patch、日期却是新 release。首次运行（旧 lock 结构）视为全部变化。

`data/upstream/lock.json` 结构升级为：

```json
{
  "7.4": { "tag": "7.4.12", "publishedAt": "2026-10-26T11:51:13Z" }
}
```

不做旧结构兼容：构建脚本一次重写，仓库里同步提交新文件。

### 5.2 构建产物

- `scripts/build-dict.mjs` 在生成 `src/data/dict/<line>.json` 时，把 `publishedAt` 一并写入
  `DictFile`。
- 新增 `src/data/releases.json`：`[{ "line": "7.4", "tag": "7.4.12", "publishedAt": "..." }]`，
  顺序按 minor 线升序。由 `build-dict.mjs` 生成并提交。
- `src/lib/dict.ts` 的 `VERSIONS` 改为从 `releases.json` 派生，不再手写。
- `Toolbar` 的版本项 label 格式：`7.4 · 7.4.12 · 2026-10-26`。
- 右侧官方面板标题格式：`官方完整配置 · 7.4.12 · 2026-10-26`。

### 5.3 清理

- 删除 `scripts/lib/tags.mjs` 与 `tests/build/tags.test.ts`，用
  `scripts/lib/releases.mjs` + `tests/build/releases.test.ts` 替代。
- `releases.mjs` 暴露 `pickStableReleases(releases, lines)`：输入 release 数组与线白名单，
  输出 `{ line, tag, publishedAt }[]`。纯函数，便于单测。

## 6. diff 数据模型与算法

### 6.1 新文件 `src/lib/diff.ts`

输入：`analysis: AnalysisResult`、`dict: DictFile`、`onlyDiff: boolean`。
输出：`DiffModel`，只做数据，不做渲染。

```ts
type DiffKind =
  | 'changed' | 'added' | 'removed' | 'newer' | 'unknown'
  | 'duplicate' | 'special' | 'no-default' | 'default';

interface DiffSegment { text: string; changed: boolean }

interface DiffLine {
  lineNo: number;              // 左侧为真实行号；右侧为合成序号；仅存在于另一侧的块为 0
  segments: DiffSegment[];
}

interface DiffCell {
  lines: DiffLine[];           // 多行块按出现顺序排列，非连续行各自带行号
}

interface DiffRow {
  key: string;
  kind: DiffKind;
  name: string;                // 左侧原始指令名（别名保持原样）
  canonicalName: string;       // 右侧官方名
  left: DiffCell | null;
  right: DiffCell | null;
  status: Status | null;       // 右侧独有（added）时为 null
  risks: RiskWarning[];        // 逐行风险标记，沿用现有 evaluateRisks
  note?: string;
  canApplyDefault: boolean;    // 箭头是否可点
}

interface DiffModel {
  rows: DiffRow[];
  counts: {
    changed: number; added: number; removed: number; newer: number;
    unknown: number; duplicate: number; special: number; default: number;
  };
  total: number;
}
```

**右侧行号是「官方默认值精简版」的合成序号**（1、2、3…），不是官方 `redis.conf` 的物理行号。
原因：官方 conf 里绝大多数默认项是注释行，物理行号只对少数显式指令存在，而且右侧本来就是
我们生成的基线文档，不是原文。官方物理行号仍由右上方只读面板负责。

### 6.2 行集合

- 左侧：当前文本里所有 `kind === 'directive'` 的行，按 `analyze` 解析出的 canonical name 分组。
- 右侧：只为基础集合生成默认值：
  1. 左侧出现过的指令；
  2. `analysis.missing` 里的重要缺失项（`maxmemory`、`maxmemory-policy`、`appendonly`、
     `save`、`protected-mode`、`bind`）。
- 其余官方指令不进入 diff；未来若要展示，加独立开关，不在本次实现。

### 6.3 行类型判定

| kind | 条件 | 左侧 | 右侧 |
|---|---|---|---|
| `changed` | 两侧都有，归一化后值不等 | 红底 | 绿底 |
| `default` | 两侧都有，归一化后值相等 | 灰字 | 灰字 |
| `added` | 仅右侧（重要缺失项） | 空 | 绿底 |
| `removed` | 仅左侧，分析状态为 `removed` | 红底 | 空 |
| `newer` | 仅左侧，分析状态为 `newer`（该版本不支持） | 紫底 | 空 |
| `unknown` | 仅左侧，分析状态为 `unknown` | 红底 | 空 |
| `duplicate` | 同一 canonical 名出现多次（非多值指令） | 红底 | 绿底（仅默认值行） |
| `special` | 仅左侧，`include` / `loadmodule` / `rename-command` / `aclfile` / `user` | 灰底 | 空 |
| `no-default` | 官方有指令但默认值为 `null` | 正常 | 显示「官方无默认值」 |

- `duplicate` 的右侧显示该指令的官方默认值，左侧把所有出现行收进一个块；`status` 取
  `duplicate`，`note` 说明后出现的会覆盖前面的值。
- `added` 行没有左侧分析结果，`status` 为 `null`；若该指令默认值也是 `null`
  （如 `bind`），右侧显示「官方无默认值」，仍计入「差异 N 项」。
- 归一化沿用 `analyze` 里的 `normalizeValue`，保证 `1gb` 与 `1024mb` 判为相等。
- 别名命中时 `name` 显示左侧原文，`canonicalName` 显示官方名，`note` 标注「旧名」。

### 6.4 多行块

`save`、`client-output-buffer-limit`、以及重复出现的同名指令按一个块处理：

- 左侧把所有出现行收进同一个 `DiffCell.lines`，每行单独带真实行号；行号不连续时逐行显示，
  不合并成范围，避免「10-300」这种误导。
- 右侧使用 `doc.defaultValue` 作为单行（值里无法可靠分行时仍为一行）。
- 词级 diff 在「左侧多行拼接文本」与「右侧单行文本」之间做，换行符作为 token 参与。
- 整块判定：任一行与默认值不等即 `changed`；重复的非多值指令优先标 `duplicate`，
  并在 `note` 里说明「同名重复，后出现的会覆盖前面的值」。

### 6.5 词级 diff

- 新函数 `diffSegments(leftText: string, rightText: string): { left: DiffSegment[]; right: DiffSegment[] }`。
- 按「连续空白 / 连续非空白」切 token，保留空白 token，便于原样拼回。
- 用最长公共子序列求未变片段，剩余片段 `changed: true`。
- 任一侧 token 数超过 400 时放弃词级 diff，整段标 `changed: true`，避免 ACL 长行拖慢渲染。
- 内存单位、yes/no 大小写不同但归一化相等的行属于 `default`，不会进入词级 diff。

### 6.6 折叠与过滤

- `onlyDiff === true`：保留 `changed` / `added` / `removed` / `newer` / `unknown` /
  `duplicate`，以及**带风险的行**（`risks.length > 0`，即使值为默认值）；过滤掉
  `default` / `no-default` / `special`，与上方编辑器隐藏这三类的规则保持一致。
- `onlyDiff === false`：保留全部；连续 `default` 行超过 2 行时折叠成一行
  `@@ 展开 N 行未修改 @@`，点击展开该段（按段维护展开状态）。
- 风险例外需要编辑器配合：`App` 把风险行的行号集合传给 `Editor`，`onlyDiff` 下这些行
  不隐藏，避免「diff 里有、点过去却看不到」。
- `counts` 只统计 `changed + added + removed + newer + unknown + duplicate`，
  `special` 与 `default` 单独给出。

## 7. 界面与交互

### 7.1 结构

底部「配置对比」Tab 的内容由 `ComparisonList` 换成新的 `DiffView`：

```text
┌ 你的配置 · 37 行                        官方默认 · 7.4.12 · 2026-10-26 ┐
│ 差异 9 项 · 点击行可在编辑器中定位                                      │
├────────┬──────────────────────────┬───┬──────────────────────────┬─────┤
│  154   │ maxmemory 0              │ » │ maxmemory 8gb            │  1  │
│  155   │ appendonly no            │ » │ appendonly yes           │  2  │
│        │ @@ 展开 12 行未修改 @@                                        │
│  168   │ save 900 1               │ » │ save 3600 1 300 100 60   │  3  │
│  169   │ save 300 10              │   │ 10000                    │     │
│  170   │ save 60 10000            │   │                          │     │
└────────┴──────────────────────────┴───┴──────────────────────────┴─────┘
```

- 五列：左行号 / 左内容 / 箭头 / 右内容 / 右行号。外两侧行号，与 IDEA 一致。
- 左侧行号是编辑器真实行号；右侧行号是「官方默认值精简版」的合成序号，按官方分节顺序
  从 1 递增，只给有右侧内容的行编号。多行块逐行显示真实行号，不合并成范围。
- 单个滚动容器，行天然对齐，不需要双编辑器滚动同步。
- 表头 sticky；等宽字体 12px；内容 `white-space: pre-wrap`，长行换行而不横向滚动。
- 未改行灰字；`changed` 左红右绿；`added` 右侧绿；`removed`/`unknown` 左侧红；
  `newer` 左侧紫；`duplicate` 左红右绿；`special` 灰底。词级高亮在红/绿底上再加深一档。
- 左侧行末带小型 `⚠` 风险标记（来自 `evaluateRisks`），`title` 内联全部风险文案，
  不额外占一列。
- 颜色取 IDEA 风格：左改 `#ffe9e6` / 高亮 `#ffc9c4`，右改 `#e6f6e6` / 高亮 `#b7f0b7`；
  删除 `#ffe0dd`，新增 `#dcf5dc`。具体值实现时可微调，但左右语义固定。

### 7.2 交互

- 点击左侧任意行：跳转到编辑器对应行，并联动右侧官方面板（复用现有 `onJump`）。
  多行块按被点击的那一行跳转。
- 箭头：
  - `changed` 且为单行、非多值块、`defaultValue !== null` 时，箭头是可点击按钮，
    tooltip「改回官方默认值」。
  - 点击行为：保留指令名与行首缩进，**把参数部分整体替换成 `defaultValue` 原文**，
    不尝试保留用户的引号风格。空字符串默认值写成 `""`，`logfile`、`requirepass`
    因此得到 `logfile ""` / `requirepass ""`，是合法配置；无法用默认值安全表达的情况
    在构建期就会被 `no-default.json` 挡住。
  - 多行块、`added`、`removed`、`newer`、`unknown`、`duplicate`、`special` 的箭头
    只做视觉指示，不可点击。
  - 箭头按钮 `aria-label` 为「将 maxmemory 改回官方默认值」这类完整描述。
- 行键盘：行组导航见 [diff 行导航行为层设计](2026-11-18-diff-behavior-layer-design.md) §5.1；箭头按钮可单独 `Tab` 聚焦。
- 「只看差异」开关沿用顶部现有开关，作用于 diff 行集合与上方编辑器。带风险的行在
  编辑器里也不隐藏（见 6.6）。
- 折叠段点击后在原位展开；不提供「全部展开/收起」按钮（避免本次范围膨胀）。
- 保留 diff 上方的风险提示列表（原有 floating warnings 逻辑迁入 `DiffView`）。

### 7.3 空状态

- 没有任何差异时显示「当前配置与官方默认值一致」。
- 左侧没有任何指令时显示「先在左侧载入或粘贴配置」。

## 8. 代码改动清单

- `scripts/lib/releases.mjs`（新增）：`pickStableReleases`。
- `scripts/lib/tags.mjs`（删除）。
- `scripts/fetch-upstream.mjs`：改用 Releases API，写新结构 lock.json。
- `scripts/build-dict.mjs`：写入 `publishedAt`；生成 `src/data/releases.json`。
- `src/types.ts`：`DictFile` 增加 `publishedAt?: string`。
- `src/lib/dict.ts`：`VERSIONS` 从 `releases.json` 派生。
- `src/lib/diff.ts`（新增）：`buildDiff`、`diffSegments`。
- `src/components/DiffView.tsx`（新增）：渲染与交互。
- `src/components/Toolbar.tsx`：版本 label 带 patch 与日期。
- `src/components/OfficialPane.tsx`：标题带日期。
- `src/App.tsx`：底部 Tab 改用 `DiffView`；传入应用默认值的回调；把风险行号集合传给 `Editor`。
- `src/components/Editor.tsx`：新增 `forceVisibleLines: Set<number>`，`onlyDiff` 下这些行
  不隐藏（与 diff 的风险例外对齐）。
- `src/components/ComparisonList.tsx`（删除）。
- `src/index.css`：删除 `.compare table` 一组样式，新增 `.diff-*` 样式。
- `src/data/releases.json`、`data/upstream/lock.json`、`src/data/dict/*.json`、
  `src/data/official/*.conf`：构建产物更新。
- `README.md`：数据来源与版本说明同步。

## 9. 测试与验证

- 单测 `tests/build/releases.test.ts`：
  - 过滤 draft / prerelease / 非 `X.Y.Z` tag；
  - 同一线取 patch 最大；
  - 白名单外的线不输出；
  - 发布日期透传；
  - tag 变化时 `saveLine` 判定为需要重下（纯函数返回布尔，避免测试里真的发请求）。
- 单测 `tests/diff.test.ts`：
  - 值改变 → `changed`，左右 token 高亮片段正确；
  - 值相同但写法不同（`1gb` vs `1024mb`）→ `default`；
  - 重要缺失项 → `added`，`status === null`，默认值为 null 时右侧显示「官方无默认值」；
  - 废弃 / 版本不支持 / 未知 → `removed` / `newer` / `unknown`；
  - `save` 多行与单行默认值 → 一个 `changed` 块，逐行真实行号；
  - 非连续重复指令 → 一个 `duplicate` 块，行号各自正确；
  - 右侧合成序号连续且只给有右侧内容的行编号；
  - `onlyDiff` 过滤：`default`/`no-default`/`special` 被滤掉，带风险的 `default` 保留；
  - 未改行折叠边界（连续 2 行不折叠、3 行折叠）。
- 组件测试 `tests/diffView.test.tsx`：
  - 渲染出左右行号与箭头；
  - 点击箭头调用应用默认值回调，且空字符串默认值写成 `""`；
  - 点击多行块中的某一行，按该行行号触发跳转。
- 现有的 `app.test.tsx`、`analyze.test.ts` 等全部保持通过。
- 浏览器冒烟：载入官方 7.4 配置 → 改 `maxmemory`、`appendonly` → 看 diff 红绿与词级高亮 →
  点箭头恢复默认 → 切换「只看差异」→ 展开折叠段 → 小窗口下长行换行不溢出。
- 构建验证：`npm run typecheck`、`npm test`、`npm run build` 全绿。

## 10. 留给实施者的决定

- `diffSegments` 的 LCS 实现用 DP 还是 Myers；400 token 上限下两者都够快，选易读的。
- 折叠段的展开状态放在 `DiffView` 内部还是提升到 `App`；建议内部，刷新不需要持久化。
- 红绿具体色值与现有 CSS 变量的映射方式。
- `DiffView` 是否需要按 `dict.sections` 分组显示分节标题；本次默认不加，保持与 IDEA 一致。
