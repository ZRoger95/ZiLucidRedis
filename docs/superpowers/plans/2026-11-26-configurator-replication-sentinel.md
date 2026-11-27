# 一主二从三哨兵场景 Implementation Plan

状态：已实现

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `/configurator` 增加第二个场景「一主二从三哨兵」：3 步问卷产出 3 份 redis 配置（主 / 从 1 / 从 2）+ 3 份哨兵配置，完成页分标签预览并逐份下载。

**Architecture:** redis 三份复用现有 `renderConfig` 管线：公共基础值存 `draft.values`，角色覆盖值存节点快照，渲染时合并；哨兵三份由纯函数按人工登记表拼固定结构文本，不走官方模板落位。场景状态增量扩展（保持 `v: 1`），守卫与敏感值识别扩展到节点快照与 `sentinel auth-pass` 行。单机场景与逐项路径零改动。

**Tech Stack:** React 19 + TypeScript strict + Vite + Vitest（jsdom）+ Testing Library + fast-check + shadcn（Radix）+ Tailwind 4。

**Spec:** [docs/superpowers/specs/2026-11-26-configurator-replication-sentinel-design.md](../specs/2026-11-26-configurator-replication-sentinel-design.md)

## Global Constraints

- 纯前端，运行时零外部请求；`base: './'` 不动；路由只允许单层；不新增运行时依赖与打包库。
- 明文密码不落盘：`values`、`scenario.applied`、`nodes[].values`、`answers.password`、哨兵密码快照落盘前都必须剔除；`sentinel auth-pass` 行纳入敏感识别。
- TypeScript strict，不新增 `any`；共享类型放 `src/types.ts`；`src/` 源码不加普通注释；界面文案中文；最小宽度 1024px。
- 标准控件从 `@/components/ui/*` 子路径导入；样式用 Tailwind；禁止直接使用 `useEffect` / `useLayoutEffect`。
- `src/data/dict/*` 等生成数据不手改；`scenarios.json`、`sentinel-rules.json` 为人工登记表，需在 AGENTS.md 人工维护清单登记。
- 先写测试再改行为；`renderConfig` 输出算法零改动；空草稿输出与官方 conf 逐字节一致的既有断言保持全绿。
- 不创建 git 提交（除非任务明确要求）；验证以 `npm run check` 与 `npm run build` 为准。
- 节点基线固定：主 6379、从 6380/6381、哨兵 26379/26380/26381；quorum 2；`down-after-milliseconds 30000`、`failover-timeout 180000`、`parallel-syncs 1`。

## Review Focus

- 主库地址为空或密码为空（内网 / 公网档）：不能进入完成页；哨兵 `monitor` 行不得产出空主机名 → Task 2 / Task 4 测试。
- 刷新后密码丢失：完成页红色警告「密码未填，当前配置将无认证」，下载确认追加提示，不静默导出无认证配置 → Task 5 测试。
- 旧草稿（无 scenario / 无 nodes）加载：逐项路径与单机场景行为不变、不崩 → Task 3 测试。
- 10 个版本字典过滤：redis 节点覆盖指令名必须存在于该版本字典；`replicaof` / `masterauth` / `replica-read-only` 在全部版本可用 → Task 2 测试。
- 哨兵三份文件仅端口不同，规则一致；`auth-pass` 仅在填了密码时出现；未填密码时哨兵文件不含密码 token → Task 2 测试。
- 重答问卷覆盖预设项：事前提示存在，覆盖后 `applied` 与节点快照同步 → Task 4 测试。

---

### Task 1: 类型扩展与登记表

**Files:**

- Modify: `src/types.ts`（场景类型联合、节点文件类型）
- Modify: `src/data/scenarios.json`（追加 `replica-sentinel` 场景登记）
- Create: `src/data/sentinel-rules.json`
- Test: `tests/scenarioData.test.ts`

**Interfaces:**

- Produces:
  - `ScenarioId = 'single-standalone' | 'replica-sentinel'`
  - `ScenarioNodeRole = 'master' | 'replica1' | 'replica2' | 'sentinel1' | 'sentinel2' | 'sentinel3'`
  - `ReplicaSentinelAnswers { profile: ScenarioProfile; tier?: string; budgetMb?: number; persistence: ScenarioPersistence; access: 'intranet' | 'public'; masterHost?: string; password?: string }`
  - `ScenarioNodeFile { role: ScenarioNodeRole; kind: 'redis' | 'sentinel'; fileName: string; title: string; values: Record<string, string> }`
  - `ScenarioState`：`id: ScenarioId`，`answers: ScenarioAnswers | ReplicaSentinelAnswers`，追加可选 `nodes?: ScenarioNodeFile[]`。
  - `sentinel-rules.json` 结构：`{ masterName: string; quorum: number; defaults: { downAfterMs: number; failoverTimeoutMs: number; parallelSyncs: number }; rules: Array<{ id: string; sensitive: boolean; note: string }> }`。

- [ ] **Step 1: 写失败数据测试** `tests/scenarioData.test.ts` 追加：
  - `replica-sentinel` 场景已登记，`name` / `summary` 非空；`access` 仅 `intranet` / `public`；`persistence` 四档齐全；`checklist` ≥ 现有单机项且每项 title / command / why 非空。
  - `sentinel-rules.json`：`masterName === 'mymaster'`、`quorum === 2`；defaults 为 30000 / 180000 / 1；rules 含 `monitor`、`auth-pass`、`down-after-milliseconds`、`failover-timeout`、`parallel-syncs` 五条；仅 `auth-pass` 标 `sensitive: true`；每条 `note` 非空。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/scenarioData.test.ts` Expected: FAIL（登记表 / 类型缺失）。
- [ ] **Step 3: 落类型与登记表** 按 Interfaces 扩展 `types.ts`；`scenarios.json` 追加 `replica-sentinel` 条目（复用单机 tiers / persistence，access 两档；common 指令理由复用单机文案；checklist 追加跨机部署、哨兵配置可写、端口放行、`--sentinel` 启动命令、NAT announce-ip 指引）；写 `sentinel-rules.json`，规则 note 对照官方 `sentinel.conf` 注释写结论与参数含义。
- [ ] **Step 4: 运行确认通过** Run: `npx vitest run tests/scenarioData.test.ts` Expected: PASS。

### Task 2: applyReplication 与哨兵渲染纯函数

**Files:**

- Modify: `src/lib/scenario.ts`（新增拓扑常量、replication 纯函数；抽出可复用的内存 / 持久化计算）
- Test: `tests/scenario.test.ts`

**Interfaces:**

- Consumes: Task 1 类型；`DictFile`；`scenarios.json`、`sentinel-rules.json`。
- Produces:
  - `REPLICA_SENTINEL_ID = 'replica-sentinel'`
  - `emptyReplicationAnswers(): ReplicaSentinelAnswers`（默认 dedicated / off / intranet）
  - `applyReplication(answers: ReplicaSentinelAnswers, dict: DictFile): { nodes: ScenarioNodeFile[]; reasons: Record<string, string> }`
  - `renderSentinelConfig(answers: ReplicaSentinelAnswers, sentinelIndex: number): string`
  - `replicationReady(answers: ReplicaSentinelAnswers): boolean`
  - `replicationStepReady(stepId: string, answers: ReplicaSentinelAnswers): boolean`
  - 节点元数据常量（角色 / 端口 / 文件名 / 标题）：主 `redis-master-6379.conf`、从 1 `redis-replica1-6380.conf`、从 2 `redis-replica2-6381.conf`、哨兵 1–3 `sentinel1-26379.conf` / `sentinel2-26380.conf` / `sentinel3-26381.conf`。

- [ ] **Step 1: 写失败测试** `tests/scenario.test.ts` 追加（`readFileSync` 读全部 10 个版本字典，沿用现有写法）：
  - 节点清单：`applyReplication` 返回 6 个节点，kind 顺序为 3 redis + 3 sentinel；文件名与角色对应上表。
  - redis 公共值：三节点均含 `protected-mode yes`、`maxmemory`（按资源答案 75%）、`maxmemory-policy`（持久化 off → `allkeys-lru`，其余 → `noeviction`）、`requirepass` 与 `masterauth`（填密码时）；持久化四档的 `appendonly` / `save` / `appendfsync` 组合与单机表一致。
  - 从库覆盖：两个从库 `values` 含 `replicaof <masterHost> 6379`、`replica-read-only yes`、独立 `port`；主库无 `replicaof`。
  - 哨兵渲染：`renderSentinelConfig(answers, 0/1/2)` 分别输出 `port 26379 / 26380 / 26381`；基础行含 `protected-mode yes`、`supervised systemd`、按节点区分的 `dir` 与 `logfile`；含 `sentinel monitor mymaster <masterHost> 6379 2`、`down-after-milliseconds mymaster 30000`、`failover-timeout mymaster 180000`、`parallel-syncs mymaster 1`；填密码时含 `sentinel auth-pass mymaster <密码>`，未填密码时无 `auth-pass` 行。
  - 字典过滤：10 版本 × 代表性答案，redis 节点 `values` 键全部存在于该版本字典。
  - readiness：`masterHost` 空 / `password` 空 → `replicationReady` false；资源无内存基数 → false；合法组合 → true；`replicationStepReady` 按资源步 / 持久化步 / 网络步分流。
  - fast-check 性质：任意合法 answers × 随机版本，redis 节点值键在字典内；哨兵文本不含空主机名占位。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/scenario.test.ts` Expected: FAIL（函数未定义）。
- [ ] **Step 3: 实现** 公共基础值与角色覆盖按 spec §5.3 划分；从库 `replicaof` 用答案 `masterHost`；哨兵文本按登记表规则顺序拼接，端口按 `sentinelIndex` 取常量；复用单机已有的内存百分比、持久化组合计算（抽出共享函数，单机 `applyScenario` 行为不变）。
- [ ] **Step 4: 运行确认通过** Run: `npx vitest run tests/scenario.test.ts` Expected: PASS。

### Task 3: 守卫、敏感识别与步骤模型扩展

**Files:**

- Modify: `src/lib/configuratorState.ts`（`draftForStorage` 清理节点快照）
- Modify: `src/lib/secrets.ts`（识别 `sentinel auth-pass` 第三 token）
- Modify: `src/lib/persistence.ts`（明文哨兵密码正则）
- Modify: `src/lib/configurator.ts`（`buildSteps` 按场景 id 插入问卷步）
- Test: `tests/configuratorState.test.ts`、`tests/configurator.test.ts`、`tests/secrets.test.ts`

**Interfaces:**

- Consumes: Task 1 `ScenarioNodeFile`；Task 2 `REPLICA_SENTINEL_ID`。
- Produces:
  - `draftForStorage`：剔除 `nodes[].values` 中的敏感指令；剥离 `answers.password`；哨兵密码快照不落盘。
  - `buildSteps(dict, opts?: { scenario?: boolean; scenarioId?: ScenarioId })`：`single-standalone` 插现有 4 步；`replica-sentinel` 插 3 步，id `__repl_resource__` / `__repl_persistence__` / `__repl_network__`，kind `'scenario'`，title 资源 / 持久化 / 网络与认证；区域步与完成页不变。

- [ ] **Step 1: 写失败测试**
  - `configuratorState.test.ts`：草稿含 `scenario.nodes`（redis 节点 `requirepass`/`masterauth`，哨兵节点 `auth-pass` 快照）+ `answers.password` → `draftForStorage` 后节点值敏感键被剔除、answers 无 password、非敏感值保留；`saveDraft` 后 `localStorage` 原始串不含明文；`loadDraft` 恢复后 nodes 仍在（密码为空）。fast-check 性质：植入密码经 applyReplication + 守卫后不落盘。
  - `secrets.test.ts`：`sentinel auth-pass mymaster hunter2` 经 `replaceSecrets` 后密码替换为占位符、`found` 计数 +1；普通 `sentinel monitor` 行不动。
  - `persistence` 对应测试：含明文 `sentinel auth-pass` 行的状态 `saveState` 抛错。
  - `configurator.test.ts`：`buildSteps(dict)` 与现状一致；`{ scenario: true, scenarioId: 'replica-sentinel' }` 插入 3 步，id / title / 位置正确，区域步与完成页不变。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/configuratorState.test.ts tests/configurator.test.ts tests/secrets.test.ts` Expected: 新用例 FAIL。
- [ ] **Step 3: 实现** 守卫遍历 `nodes[].values` 按字典敏感集合剔除；secrets 识别两词前缀 `sentinel auth-pass` 并掩码第三 token；persistence 正则补哨兵行；buildSteps 按 scenarioId 选步骤清单。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: PASS；再跑 `npx vitest run tests/configuratorPage.test.tsx` 确认逐项路径未破坏。

### Task 4: 问卷 UI 与页面接线

**Files:**

- Modify: `src/components/configurator/VersionStep.tsx`（两个场景入口）
- Modify: `src/components/configurator/ScenarioStep.tsx`（按场景 id 分支渲染）
- Modify: `src/components/configurator/ConfiguratorPage.tsx`（场景创建 / 答案写入 / 生成跳转 / 索引解耦）
- Test: `tests/configuratorPage.test.tsx`

**Interfaces:**

- Consumes: Task 2 `emptyReplicationAnswers / replicationReady / replicationStepReady / applyReplication`；Task 3 `buildSteps` opts。
- Produces:
  - `VersionStep` props 扩展：`onStartScenario: (id: ScenarioId) => void`；渲染「单机单实例」「一主二从三哨兵」两个场景入口按钮；`scenarioActive` 时对应入口文案「继续场景问卷」。
  - `ConfiguratorPage`：按所选场景 id 创建 `scenario` 状态；`answerChange` 按场景类型写入；网络步「生成配置」调用 `applyReplication` 写入公共 `values` 与 `nodes` 快照后跳完成页；「逐项配置」跳转改为定位第一个区域步索引，移除硬编码 5。

- [ ] **Step 1: 写失败页面测试**（追加 `configuratorPage.test.tsx`，沿用 render / userEvent 模式）：
  - 版本页出现两个场景入口；点「一主二从三哨兵」进入资源步，导航出现 3 个问卷步。
  - 资源（混部预算 2 GB）→ 持久化（混用）→ 网络与认证：主库地址 `10.0.0.5`、密码 `s3cret` → 「生成配置」直达完成页。
  - 网络步未填主库地址或密码：「生成配置」禁用；补齐后可点。
  - 完成页预览区出现 6 个文件标签（主 / 从 1 / 从 2 / 哨兵 1–3）；切到从库标签预览含 `replicaof 10.0.0.5 6379`；切到哨兵标签预览含 `sentinel monitor mymaster 10.0.0.5 6379 2`。
  - 重答覆盖：完成页后回问卷改持久化为「不开」→ 生成 → 预览 `appendonly no` + `save ""`；问卷顶部有覆盖提示文案。
  - 逐项入口不受影响：不点场景按钮时 footer「下一步」仍进 INCLUDES（现有测试保持绿）。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/configuratorPage.test.tsx` Expected: 新用例 FAIL。
- [ ] **Step 3: 实现** ScenarioStep 按 `draft.scenario.id` 分支：复用资源 / 持久化问题组件；网络与认证问题含主库地址 Input、密码 password Input、内网 / 公网 RadioGroup（无「仅本机」）、公网劝阻警告。页面状态创建与答案写入按场景判别；生成分支按 id 调 `applyScenario` 或 `applyReplication`；footer 禁用按对应 `*StepReady`。
- [ ] **Step 4: 运行确认通过** Run: `npx vitest run tests/configuratorPage.test.tsx` Expected: 全部 PASS。

### Task 5: 完成页多文件预览、下载与清单

**Files:**

- Modify: `src/components/configurator/FinishStep.tsx`（tabs 多文件预览、逐份下载、隐藏本场景「带回体检页」）
- Modify: `src/components/configurator/ConfiguratorPage.tsx`（构建 6 份文件视图、传 review / checklist / passwordMissing）
- Test: `tests/finishStep.test.tsx`、`tests/configuratorPage.test.tsx`

**Interfaces:**

- Consumes: Task 2 节点元数据与 `renderSentinelConfig`；Task 1 `ScenarioChecklistItem`；现有 `scenarioReview`。
- Produces:
  - 页面计算 `ScenarioFileView { role; title; fileName; text }[]`：redis 节点文本 = `renderConfig(official, dict, 合并公共值 + 节点覆盖值)`；哨兵节点文本 = `renderSentinelConfig` 输出。
  - `FinishStep` 新增可选 `files?: ScenarioFileView[]`；有 files 时用现有 shadcn `tabs` 切换 6 份预览，下载按钮下载当前激活文件（文件名取 `fileName`）；`files` 存在时隐藏「带回体检页」按钮；现有单文件预览 / review / checklist / passwordMissing 行为不变。

- [ ] **Step 1: 写失败测试**
  - `finishStep.test.tsx`：传 6 个 files → 出现 6 个标签与对应文件名；切标签预览文本切换；下载按钮触发当前文件 blob（mock URL.createObjectURL 断言文件名）；files 存在时无「带回体检页」按钮；不传 files 时现状不变（现有测试保持绿）。
  - `configuratorPage.test.tsx`：replication 场景生成后完成页出现系统层清单追加项（跨机部署 / 配置可写 / 端口放行 / `--sentinel` 启动）；密码缺失警告出现；下载 confirm 文案含「密码未填」。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/finishStep.test.tsx tests/configuratorPage.test.tsx` Expected: 新用例 FAIL。
- [ ] **Step 3: 实现** 页面 useMemo 构建文件视图；redis 合并值：`{ ...draft.values, ...node.values }` 传入 `renderConfig`；FinishStep tabs 状态管激活文件；下载 blob 文件名按 `fileName`；review 沿用 `scenarioReview`（公共预设分组），checklist 取 replication 场景登记表。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: 全部 PASS。

### Task 6: 文档同步与全量验证

**Files:**

- Modify: `README.md`（用户可见行为：第二个场景入口、3 步问卷、6 份文件下载）
- Modify: `AGENTS.md`（人工维护清单补登 `sentinel-rules.json`）
- Modify: `docs/superpowers/specs/2026-11-19-configurator-design.md`、`2026-11-26-configurator-scenario-single-design.md`（非目标清单中「哨兵 / 多实例」条目改为链接本设计）
- Modify: 本计划文件头（状态）

- [ ] **Step 1: 同步文档** README 只写用户可见行为，不写实现细节；spec 现状描述与非目标随实现更新。
- [ ] **Step 2: 全量验证** Run: `npm run check` Expected: lint / format / typecheck / test 全绿。Run: `npm run build` Expected: 构建成功。
- [ ] **Step 3: 收尾** 实现完成后 spec 状态改「已实现」，计划文件头标「状态：已实现」；被后续改动覆盖的做法在状态行注明。
