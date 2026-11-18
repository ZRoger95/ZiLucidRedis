# 体检结果面板：把摘要条并入底部 Tab

日期：2026-11-18
状态：已实现
范围：只调整摘要信息与「只看差异」的归属，不改分析、风险规则与 diff 算法。

## 1. 现状

- 编辑器上方有一条摘要条（`SummaryBar`），渲染 `已改 / 未知 / 已移除 / 版本不支持 / 重复 / 告警 / 缺失`，每项都是按钮，点击跳到该类第一条并定位编辑器；「缺失」只打开搜索面板。
- 工具栏有「只看差异」开关，同时影响 `buildDiff` 的行集合、编辑器隐藏行与内联注释。
- 底部 Tab 只有「配置对比」「配置项说明」两个页签。
- 计数重复出现两处：摘要条与 `DiffView` 页头的「差异 N 项 / 共 M 项」。
- 风险文案分散在两处：无行号的告警只在 `DiffView` 页头列出，有行号的只在 diff 行末显示 `⚠`，没有一份完整清单。

## 2. 目标

- 摘要信息从编辑器上方移到下方 Tab 区，形态接近 IDEA 的 Problems 面板：分类 + 计数 + 可定位的明细行。
- 摘要条与 `DiffView` 的重复计数收敛到一处。
- 「只看差异」从工具栏移到「配置对比」页头，跟随它实际影响的内容。
- 编辑器上方不再有常驻信息条，首屏多出一行高度。

## 3. 非目标 / 反目标

非目标：

- 不改 `analyze`、`evaluateRisks`、`buildDiff` 的判定逻辑。
- 不做「全部展开 / 全部忽略 / 一键修复全部」这类批量操作。
- 不把状态筛选联动到编辑器或官方面板（只筛选本面板的清单）。
- 不新增按分节分组的树形结构；扁平分组足够。

反目标：

- 下拉选项会替用户切换 Tab，或选择后位置突然跳动。
- 计数、告警、缺失在界面上出现两个口径。
- 摘要条移走后，首屏无法判断这份配置有没有问题。

## 4. 已选方案

对话中确认：**A —— 各页各自筛选**；底部默认选中「体检结果」。

| 方案 | 说明 | 结论 |
|---|---|---|
| A | 问题筛选下拉在「体检结果」页，只看差异移到「配置对比」页头 | 采用：控件跟着它影响的内容走，无跨 Tab 联动 |
| B | 一个全局下拉同时管「只看差异」与各状态，选中后自动切 Tab | 放弃：控件替用户切页，状态耦合，实现复杂 |
| C | 顶部保留一行精简计数，完整清单进底部 Tab | 放弃：仍占首屏一行，计数与底部重复 |

## 5. 界面结构

```text
工具栏：版本 | 内联注释 | 中文摘要 | 搜索配置项 | 清空 | 载入官方配置 | 上传 conf | 导出

┌─ 你的配置 ────────────────┬─ 官方完整配置 ──────────────┐
│                           │                             │
├───────────────────────────┴─────────────────────────────┤
│ [体检结果] [配置对比] [配置项说明]                 [收起] │
│ 筛选 [全部 ▾]                       共 12 项             │
│ 告警 2                                                   │
│   高危  maxmemory 设得过小 · 第 42 行                    │
│   中危  appendonly 关闭且没有 save 规则（默认值触发）     │
│ 缺失 4                                                   │
│   maxmemory      未显式配置，点击插入官方默认值           │
│   bind           未显式配置，点击后在搜索面板中选择       │
│ 已改 9                                                   │
│   maxmemory 0 · 第 42 行                                 │
└──────────────────────────────────────────────────────────┘
```

- Tab 顺序固定为 `体检结果`（默认）/ `配置对比` / `配置项说明`。
- 页内头部左侧是筛选下拉，右侧是「共 N 项」。
- 分组顺序固定：告警、缺失、已改、未知、已移除、版本不支持、重复；空分组不渲染。
- 分组标题由「名称 + 计数」组成，不做折叠——清单本身就是计数明细。
- 单行结构：名称（指令名或告警编号语义）+ 说明 + 行号；告警按级别着色（高危 / 中危 / 提示）。
- 收起下方面板的行为不变：收起后 Tab 内容整体隐藏。

`DiffView` 页头改为 `你的配置 · 共 M 项` + 官方基线 + 行定位提示，删除「差异 N 项」与 floating 告警列表。

## 6. 数据模型

新增纯函数模块 `src/lib/checkup.ts`：

```ts
export type CheckupKind = 'warning' | 'missing' | 'changed' | 'unknown' | 'removed' | 'newer' | 'duplicate';

export interface CheckupItem {
  id: string;
  kind: CheckupKind;
  label: string;              // 指令名，告警取级别 + 文案
  detail?: string;            // 当前值 / 风险说明 / 缺失提示
  lineNo: number | null;      // 缺失与无行号告警为 null
  level?: RiskWarning['level'];
}

export interface CheckupGroup {
  kind: CheckupKind;
  label: string;              // 告警 / 缺失 / 已改 / 未知 / 已移除 / 版本不支持 / 重复
  items: CheckupItem[];
}

export function buildCheckup(analysis: AnalysisResult, warnings: RiskWarning[]): CheckupGroup[];
```

- 状态类明细来自 `analysis.byLine`：`label` 取解析行的指令名，`detail` 取该行 `raw.trim()`，`lineNo` 取真实行号；`removed` / `newer` / `duplicate` 的说明沿用 `LineAnalysis.note`。
- 告警明细来自 `warnings`：`level` 透传，`label` 为告警文案，`lineNo` 取 `lineNos[0] ?? null`；无行号的告警不可点击。
- 缺失明细来自 `analysis.missing`：`label` 为指令名，`detail` 固定为「未显式配置」。
- 分组只保留 `items.length > 0` 的项，顺序由函数内常量固定。

筛选是本面板的局部状态：`'all' | CheckupKind`，`all` 时渲染全部分组，选中具体类别时只渲染该分组。

## 7. 行为

- 点击状态类或带行号的告警明细：`jumpToLine(lineNo)`，与现有摘要条一致。
- 点击缺失明细：若该指令有官方默认值，直接用 `insertDirective` 插入并跳转；官方无默认值（如 `bind`）时打开搜索面板，由用户在面板中确认后再插入。
- 无行号的告警明细渲染为普通文本，不是按钮。
- 筛选下拉只影响清单，不切 Tab、不改编辑器、不改官方面板。
- 「只看差异」开关移动到 `DiffView` 页头右侧，仍是全局状态（影响编辑器、内联注释与 diff），持久化字段 `onlyDiff` 不变。
- 空状态：
  - 没有任何配置指令时，面板显示「先在左侧载入或粘贴配置」；
  - 有配置且无任何问题时，显示「当前配置没发现问题」。

## 8. 代码改动清单

- 新增 `src/lib/checkup.ts`：`buildCheckup`。
- 新增 `src/components/CheckupPanel.tsx`：筛选下拉、分组清单、空状态。
- 删除 `src/components/SummaryBar.tsx` 与 `tests/summaryBar.test.tsx`。
- `src/App.tsx`：删除摘要条；用 `buildCheckup` 计算分组；底部 Tab 增加 `checkup` 并设为默认；给面板传 `groups`、`hasContent`、`onJump`、`onInsertMissing`。
- `src/components/Toolbar.tsx`：删除「只看差异」开关及其 props。
- `src/components/DiffView.tsx`：删除 `warnings` prop 与 floating 列表、删除「差异 N 项」；页头新增「只看差异」开关（`onlyDiff`、`onOnlyDiffChange`）。
- `src/components/SearchPalette.tsx`：不新增预填能力，缺失且无默认值时只负责打开面板。
- 设计文档：更新 [v2 diff 设计](2026-11-17-diff-experience-design.md) 的 7.2 节（开关位置、floating 告警归属），更新 [主设计](2026-11-16-redis-conf-doctor-design.md) 的顶部栏与底部 Tab 描述。
- `README.md`：使用说明补充「体检结果」Tab，说明「只看差异」位置变化。

## 9. 测试与验证

- `tests/checkup.test.ts`（纯函数）：
  - 分组顺序固定，空分组不出现；
  - 状态明细带真实行号与当前值；
  - 无行号告警 `lineNo === null`，有行号告警取首行；
  - 缺失项来自 `analysis.missing`。
- `tests/checkupPanel.test.tsx`：
  - 渲染分组标题与计数；
  - 切换筛选后只剩对应分组；
  - 点击明细触发跳转；点击缺失项触发插入回调；
  - 无问题时显示空状态文案。
- `tests/diffView.test.tsx`：更新调用去掉 `warnings`；新增「切换只看差异调用回调」用例。
- `tests/toolbar.test.tsx`：删除「只看差异」相关用例。
- 全量验证：`npm run check`、`npm run build`；浏览器冒烟：载入官方配置 → 体检结果默认展示 → 筛「告警」→ 点明细定位 → 点缺失插入 → 切对比页勾选只看差异。

## 10. 留给实施者的决定

- 分组的视觉分隔用边框还是标题间距；保持与现有面板一致即可。
- 告警「label / detail」的具体措辞，避免和 diff 行末 `⚠` 的 title 重复表达。
- 明细行是否显示指令当前值（当前方案显示），若过长用省略号截断。
