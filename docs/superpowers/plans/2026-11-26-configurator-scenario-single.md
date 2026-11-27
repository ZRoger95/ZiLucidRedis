# 单机单实例场景预设 Implementation Plan

状态：已实现

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `/configurator` 增加「从场景开始」入口与单机单实例 4 问问卷，答案批量写入草稿推荐值，答完直达带预设复查清单与系统层清单的完成页。

**Architecture:** 预设是值层不是第二套生成器：纯函数 `applyScenario` 把问卷答案算成约 12 条指令值写入现有 `ConfiguratorDraft.values`，`renderConfig` 零改动。草稿增加可选 `scenario` 字段（保持 `v: 1`），持久化守卫同步扩展三处敏感值剔除。问卷 4 步插入版本步之后，区域步全部保留为可选复查。

**Tech Stack:** React 19 + TypeScript strict + Vite + Vitest（jsdom）+ Testing Library + fast-check + shadcn（Radix）+ Tailwind 4。

**Spec:** [docs/superpowers/specs/2026-11-26-configurator-scenario-single-design.md](../specs/2026-11-26-configurator-scenario-single-design.md)

## Global Constraints

- 纯前端，运行时零外部请求；`base: './'` 不动；路由只允许单层。
- 明文密码不落盘：`values`、`scenario.applied`、`scenario.answers.password` 三处都必须被 `draftForStorage` 剔除。
- TypeScript strict，不新增 `any`；共享类型放 `src/types.ts`。
- `src/` 源码不加普通注释（ESLint 门禁）；界面文案中文；最小宽度 1024px。
- 新控件用 `npx shadcn@latest add <name>` 生成并提交；只从 `@/components/ui/<name>` 子路径导入；样式用 Tailwind。
- 禁止直接使用 `useEffect` / `useLayoutEffect`；用事件处理器与渲染期派生。
- `src/data/dict/*` 等生成数据不手改；`scenarios.json` 是人工登记表。
- 先写测试再改行为；`renderConfig` 输出算法零改动；空草稿输出与官方 conf 逐字节一致的既有断言保持全绿。
- 不创建 git 提交（项目规则：除非任务明确要求）；验证以 `npm run check` 与 `npm run build` 为准。
- 问卷默认值（实现决定）：Q1 默认独占、Q3 默认「不开」、Q4 默认仅本机；均为预选可改。

## Review Focus

- 混部预算非法输入（空 / 0 / 负数 / 非数字）：下一步禁用并提示，`applyScenario` 不产出 NaN maxmemory → Task 2 / Task 4 测试。
- 内网 IP 为空或访问面为内网 / 公网但密码为空：不能进入完成页 → Task 4 测试。
- 刷新后密码丢失（内网 / 公网档）：完成页红色警告 + 下载确认追加提示，不静默导出无认证 conf → Task 6 测试。
- 旧草稿（无 scenario 字段）加载：逐项路径行为不变、不崩 → Task 3 测试。
- 重答问卷覆盖用户改过的预设项：事前提示存在，覆盖后 `applied` 与 `values` 同步 → Task 4 测试。

---

### Task 1: 类型与场景登记表

**Files:**

- Modify: `src/types.ts`（`FreeLineKind` 附近追加场景类型；`ConfiguratorStep.kind` 加 `'scenario'`；`ConfiguratorDraft` 加 `scenario?`）
- Create: `src/data/scenarios.json`
- Test: `tests/scenarioData.test.ts`

**Interfaces:**

- Produces: `ScenarioProfile = 'dedicated' | 'shared'`、`ScenarioPersistence = 'off' | 'rdb' | 'aof' | 'mixed'`、`ScenarioAccess = 'local' | 'intranet' | 'public'`、`ScenarioAnswers { profile; tier?: string; budgetMb?: number; persistence; access; bindIp?: string; password?: string }`、`ScenarioState { id: 'single-standalone'; answers: ScenarioAnswers; applied: Record<string, string> }`、`ScenarioTier { id; label; ramMb }`、`ScenarioOption { id; label; summary; help? }`、`ScenarioChecklistItem { title; command; why }`、`ScenarioRegistry { id; name; summary; tiers: ScenarioTier[]; persistence: ScenarioOption[]; access: ScenarioOption[]; reasons: Record<string, string>; checklist: ScenarioChecklistItem[] }`；`scenarios.json` 为 `Record<string, ScenarioRegistry>`，键 `single-standalone`。

- [ ] **Step 1: 写失败的数据测试** `tests/scenarioData.test.ts`：断言 `single-standalone` 存在；tiers 恰为 `1c1g / 2c2g / 2c4g / 4c8g / 8c16g` 且 ramMb 递增；persistence 四档 id 齐全且每项 summary 与 help 非空；access 三档 id 齐全；reasons 覆盖核心指令集 `supervised / logfile / dir / protected-mode / bind / maxmemory / maxmemory-policy / appendonly / save / appendfsync / requirepass`；checklist ≥ 5 项且每项 title / command / why 非空。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/scenarioData.test.ts` Expected: FAIL（模块不存在）。
- [ ] **Step 3: 加类型、写登记表** 按 Interfaces 落类型；`scenarios.json` 填入档位（ramMb 1024 / 2048 / 4096 / 8192 / 16384）、四档持久化与三档访问面的中文 label / summary / help（help 摘录官方语义：AOF everysec 崩溃约丢 1 秒、RDB 丢最近几分钟、混用 RDB 保快速重启）、核心指令理由（可核对官方 conf / config.c）、系统清单 5 项（`vm.overcommit_memory=1`、THP `echo never`、`net.core.somaxconn`、nofile、swap）。
- [ ] **Step 4: 运行确认通过** Run: `npx vitest run tests/scenarioData.test.ts` Expected: PASS。

### Task 2: applyScenario 纯函数

**Files:**

- Create: `src/lib/scenario.ts`
- Test: `tests/scenario.test.ts`

**Interfaces:**

- Consumes: Task 1 类型与 `scenarios.json`；`DictFile`（`src/types.ts`）。
- Produces: `SCENARIO_ID = 'single-standalone'`；`emptyScenarioAnswers(): ScenarioAnswers`（默认 dedicated / off / local）；`maxmemoryFor(answers: ScenarioAnswers): string`；`scenarioReady(answers: ScenarioAnswers): boolean`；`scenarioStepReady(stepId: string, answers: ScenarioAnswers): boolean`；`applyScenario(answers: ScenarioAnswers, dict: DictFile): { values: Record<string, string>; reasons: Record<string, string> }`；`ScenarioReviewItem { name; value: string | null; reason: string; state: 'applied' | 'modified' | 'reset' }`、`ScenarioReviewGroup { sectionId: string; items: ScenarioReviewItem[] }`、`scenarioReview(draft: ConfiguratorDraft, dict: DictFile): ScenarioReviewGroup[]`。

- [ ] **Step 1: 写失败测试** `tests/scenario.test.ts`，用 `readFileSync` 读全部 10 个版本字典（同 `configuratorData.test.ts` 写法）：
  - `maxmemoryFor`：1c1g→`768mb`、2c2g→`1536mb`、2c4g→`3gb`、4c8g→`6gb`、8c16g→`12gb`；shared budgetMb 2048→`1536mb`、4096→`3gb`。
  - `applyScenario` 持久化四档 × 10 版本：off→`appendonly no`+`save ""`+`maxmemory-policy allkeys-lru`；rdb→`appendonly no`+`save 3600 1 300 100 60 10000`+`noeviction`；aof→`appendonly yes`+`save ""`+`appendfsync everysec`+`noeviction`；mixed→`appendonly yes`+默认 save 点+`appendfsync everysec`。
  - 访问面三档：local→`bind 127.0.0.1 -::1` 且无 requirepass；intranet（bindIp `10.0.0.5`、password `s3cret`）→`bind 10.0.0.5 127.0.0.1 -::1`+`requirepass s3cret`；public→`bind 0.0.0.0 -::*`+requirepass；三档均 `protected-mode yes`、`supervised systemd`。
  - 全版本：产出指令名全部存在于该版本字典；6.2 含 bind / save / dir / logfile。
  - `scenarioReady`：dedicated 无 tier→false；shared budgetMb 0 / 负数 / undefined→false；intranet 缺 IP 或缺密码→false；public 缺密码→false；合法组合→true。
  - fast-check 性质：任意合法 answers × 随机版本，`applyScenario` 产出的 values 键都在字典内且值非空。
  - `scenarioReview`：applied 与 values 相等→`applied`；values 改过→`modified`；values 删键→`reset`（value null）；分组按 `dict.sections` 顺序。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/scenario.test.ts` Expected: FAIL。
- [ ] **Step 3: 实现** maxmemory 算法：`mb = ramMb * 3 / 4`（shared 用 budgetMb），`mb % 1024 === 0` 时输出 `${mb / 1024}gb` 否则 `${mb}mb`。applyScenario 按 spec §5.2 核心集组装，逐键过滤字典存在性；reasons 取登记表，maxmemory 理由拼入档位 / 预算摘要。scenarioReview 遍历 `draft.scenario.applied`，按字典 section 归组、sections 顺序排序。
- [ ] **Step 4: 运行确认通过** Run: `npx vitest run tests/scenario.test.ts` Expected: PASS。

### Task 3: 草稿守卫扩展与步骤模型

**Files:**

- Modify: `src/lib/configuratorState.ts`（`draftForStorage`）
- Modify: `src/lib/configurator.ts`（`buildSteps` 加可选参数）
- Test: `tests/configuratorState.test.ts`、`tests/configurator.test.ts`

**Interfaces:**

- Consumes: Task 1 `ScenarioState`；Task 2 `applyScenario`。
- Produces: `buildSteps(dict: DictFile, opts?: { scenario?: boolean }): ConfiguratorStep[]`——scenario 为真时版本步后插入 4 步，id `__scenario_profile__` / `__scenario_resource__` / `__scenario_persistence__` / `__scenario_access__`，kind `'scenario'`，title 部署画像 / 资源 / 持久化 / 访问面；`draftForStorage` 剔除 `scenario.applied` 敏感键与 `answers.password`。

- [ ] **Step 1: 写失败测试**
  - `configuratorState.test.ts` 追加：草稿含 `scenario: { id, answers: { …, password: 'hunter2' }, applied: { requirepass: 'hunter2', maxmemory: '3gb' } }` → `draftForStorage` 后 applied 无 requirepass、answers 无 password、maxmemory 保留；`saveDraft` 后 `localStorage` 原始串不含 `hunter2`；`loadDraft` 恢复后 scenario 仍在（密码为空）。旧草稿（无 scenario）加载行为不变。
  - fast-check 性质：任意植入密码经 applyScenario + draftForStorage 后 localStorage 不含该明文。
  - `configurator.test.ts` 追加：`buildSteps(dict)` 与现状一致（无 scenario 步）；`buildSteps(dict, { scenario: true })` 步骤数 +4、4 步位置与 id 正确、区域步与完成页不变。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/configuratorState.test.ts tests/configurator.test.ts` Expected: FAIL。
- [ ] **Step 3: 实现** draftForStorage 在现有剔除后追加 scenario 清理（无 scenario 时原样返回）；buildSteps 按 Interfaces 插入问卷步。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: PASS；再跑 `npx vitest run tests/configuratorPage.test.tsx` 确认逐项路径未破坏。

### Task 4: 问卷 UI 与流程接线

**Files:**

- Create: `src/components/ui/radio-group.tsx`（`npx shadcn@latest add radio-group`，按项目门禁整理导入）
- Create: `src/components/configurator/ScenarioStep.tsx`
- Modify: `src/components/configurator/VersionStep.tsx`（加入口按钮）
- Modify: `src/components/configurator/ConfiguratorPage.tsx`（模式接线、Q4 生成跳转、footer 标签与禁用）
- Test: `tests/configuratorPage.test.tsx`

**Interfaces:**

- Consumes: Task 2 `emptyScenarioAnswers / scenarioReady / scenarioStepReady / applyScenario / SCENARIO_ID`；Task 3 `buildSteps opts`。
- Produces: `ScenarioStep` props `{ stepId: string; answers: ScenarioAnswers; onChange: (patch: Partial<ScenarioAnswers>) => void }`；`VersionStep` 新增 props `{ scenarioActive: boolean; onStartScenario: () => void; onItemized: () => void }`，渲染「从场景开始」（scenarioActive 时文案「继续场景问卷」）与「逐项配置」两个按钮；页面行为：Q4 footer 按钮文案「生成配置」，点击写入 values + applied 并跳完成页。

- [ ] **Step 1: 写失败页面测试**（追加到 `configuratorPage.test.tsx`，沿用现有 render / userEvent 模式）：
  - 版本步出现「从场景开始」与「逐项配置」两个按钮；点「从场景开始」进入「部署画像」问卷步，导航出现 4 个问卷步；已有场景草稿时按钮文案为「继续场景问卷」。
  - 独占路径：选档位 2C4G → 持久化选「混用」→ 访问面默认仅本机 → 点「生成配置」→ 直达完成页；预览含 `maxmemory 3gb`、`appendonly yes`、`bind 127.0.0.1 -::1` 生效行。
  - 混部路径：选混部 → 预算输入 2 GB → 完成页预览含 `maxmemory 1536mb`。
  - 内网未填密码：「生成配置」禁用；填 IP + 密码后可点；完成页后刷新（重渲染 + loadDraft）密码字段为空。
  - 重答覆盖：完成页后导航回问卷改持久化为「不开」→ 生成 → 预览 `appendonly no` + `save ""`，`maxmemory-policy allkeys-lru`；问卷顶部有覆盖提示文案。
  - 逐项入口不受影响：不点场景按钮时 footer「下一步」仍进 INCLUDES（现有测试保持绿）。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/configuratorPage.test.tsx` Expected: 新用例 FAIL。
- [ ] **Step 3: 生成 radio-group 并实现组件与接线** ScenarioStep 按 stepId 渲染四问之一（StepHeader 骨架 + RadioGroup / Select / Input；帮助文案用 Callout / details；混部估算提示、小内存警告、磁盘警告、公网劝阻警告按 spec §5.1）；每答一步 `onChange` 即写入草稿持久化。ConfiguratorPage：`steps = buildSteps(dict, { scenario: draft.scenario !== undefined })`；入口创建 scenario 并跳到 Q1；footer 在问卷步按 `scenarioStepReady` 禁用、Q4 文案「生成配置」并在点击时 apply + 跳完成页；重答提示文案常驻问卷步顶部。
- [ ] **Step 4: 运行确认通过** Run: `npx vitest run tests/configuratorPage.test.tsx` Expected: 全部 PASS。

### Task 5: 字段来源标记

**Files:**

- Modify: `src/components/configurator/DirectiveField.tsx`（加可选 `origin` prop 与徽标）
- Modify: `src/components/configurator/RegionStep.tsx`（计算并传入 origin）
- Test: `tests/directiveField.test.tsx`

**Interfaces:**

- Consumes: `ConfiguratorDraft.scenario`。
- Produces: `DirectiveField` 新增可选 prop `origin?: 'scenario' | 'modified'`；渲染中文徽标「来自场景」/「已手动修改」；无 origin 时不渲染。

- [ ] **Step 1: 写失败测试** `directiveField.test.tsx` 追加：origin='scenario' 显示「来自场景」；origin='modified' 显示「已手动修改」；不传 origin 两者都不出现。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/directiveField.test.tsx` Expected: FAIL。
- [ ] **Step 3: 实现** RegionStep 计算：`applied[name]` 存在且 `values[name] === applied[name]` → scenario；存在但不等 → modified；values 无键 → 不传。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: PASS。

### Task 6: 完成页复查清单与系统清单

**Files:**

- Modify: `src/components/configurator/FinishStep.tsx`
- Modify: `src/components/configurator/ConfiguratorPage.tsx`（传 review / checklist / passwordMissing；下载确认追加提示）
- Test: `tests/finishStep.test.tsx`、`tests/configuratorPage.test.tsx`

**Interfaces:**

- Consumes: Task 2 `scenarioReview / ScenarioReviewGroup`；Task 1 `ScenarioChecklistItem`。
- Produces: `FinishStep` 新增可选 props `{ review?: ScenarioReviewGroup[]; checklist?: ScenarioChecklistItem[]; passwordMissing?: boolean; onJumpSection?: (sectionId: string) => void }`；有 review 时渲染「预设改了什么」（按区域分组，每条指令 / 值 / 理由 / 状态 / 「去修改」按钮点击调用 `onJumpSection(sectionId)`）与「系统层必做项」；passwordMissing 时红色警告「密码未填，当前配置将无认证」。

- [ ] **Step 1: 写失败测试**
  - `finishStep.test.tsx`：传 review + checklist → 出现分组标题、指令名、理由、「去修改」按钮（点击回调带 sectionId）、系统清单命令；reset 项显示「已恢复官方默认」；passwordMissing → 警告文案；不传新 props 时与现状一致（现有测试保持绿）。
  - `configuratorPage.test.tsx`：内网档填密码生成后，模拟刷新（localStorage 重渲染）进完成页 → 警告出现；点下载 → confirm 文案含「密码未填」。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/finishStep.test.tsx tests/configuratorPage.test.tsx` Expected: 新用例 FAIL。
- [ ] **Step 3: 实现** 页面在场景模式下用 `scenarioReview(draft, dict)` 与登记表 checklist 传参；`onJumpSection` 定位区域步 index；download 的 confirm 文案在 passwordMissing 时追加提示。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: 全部 PASS。

### Task 7: 文档同步与全量验证

**Files:**

- Modify: `README.md`（用法新增场景入口说明）
- Modify: `docs/superpowers/specs/2026-11-26-configurator-scenario-single-design.md`（状态→已实现）
- Modify: `docs/superpowers/specs/2026-11-19-configurator-design.md`、`2026-11-20-configurator-step-skeleton-design.md`（非目标清单中「场景预设」条目改为链接本设计）
- Modify: 本计划文件头（状态→已实现）

- [ ] **Step 1: 同步文档** 按上述文件更新；README 只写用户可见行为（两个入口、4 问、完成页清单），不写实现细节。
- [ ] **Step 2: 全量验证** Run: `npm run check` Expected: lint / format / typecheck / test 全绿。Run: `npm run build` Expected: 构建成功。
- [ ] **Step 3: 收尾** 计划文件头标「状态：已实现」；如有被后续改动覆盖的做法在状态行注明。
