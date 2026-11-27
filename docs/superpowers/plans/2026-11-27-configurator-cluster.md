# 三主三从切片集群场景 Implementation Plan

状态：已实现

**Goal:** 为 `/configurator` 增加第三个场景「三主三从集群」：3 步问卷产出 6 份 cluster 模式的 `redis.conf`，完成页 6 标签预览并逐份下载，系统层清单给出 `--cluster create` 初始化命令。

**Architecture:** 完全复用哨兵场景的双层值模型（`draft.values` 公共值 + `nodes[].values` 节点覆盖值）与 `files` + `tabs` 完成页；6 个节点都走 `renderConfig`，槽分配与主从关系只存在于清单命令中。新增 `ClusterAnswers`、`applyCluster`、`clusterCreateCommand`、`clusterChecklist`，其余守卫与渲染零改动。

**Tech Stack:** React 19 + TypeScript strict + Vite + Vitest（jsdom）+ Testing Library + fast-check + shadcn（Radix）+ Tailwind 4。

**Spec:** [docs/superpowers/specs/2026-11-27-configurator-cluster-design.md](../specs/2026-11-27-configurator-cluster-design.md)

## Global Constraints

- 纯前端，运行时零外部请求；`base: './'` 不动；不新增运行时依赖。
- 明文密码不落盘：节点快照与 `answers.password` 沿用现有守卫；不为 6.2 手写字典外指令。
- TypeScript strict，不新增 `any`；共享类型放 `src/types.ts`；`src/` 源码不加注释；界面文案中文；最小宽度 1024px。
- 标准控件从 `@/components/ui/*` 子路径导入；样式 Tailwind；禁止直接使用 `useEffect` / `useLayoutEffect`。
- `src/data/scenarios.json` 为人工登记表，已在 AGENTS.md 清单内，无需再登记新文件。
- 先写测试再改行为；`renderConfig` 算法零改动。
- 节点基线固定：主 7000/7001/7002，从 7003/7004/7005，总线 17000–17005；槽均分三组；`--cluster-replicas 1`。
- 不创建 git 提交；验证以 `npm run check` 与 `npm run build` 为准。

## Review Focus

- 节点 IP 或密码为空时不能进入完成页；空 IP 不得产出 `cluster create` 里的空地址。
- 从库文件不得出现 `replicaof`（集群模式会与之冲突）。
- 6.2 字典没有 `cluster-config-file`：该版本跳过该行，其余 9 个版本写入 `nodes-<端口>.conf`。
- 三个场景互不干扰：进入某场景后 `buildSteps` 插入的步数与 id 只与该场景相关。
- 旧草稿（哨兵 / 单机 / 无 scenario）加载后行为不变。

---

### Task 1: 类型与场景登记表

**Files:**

- Modify: `src/types.ts`（`ScenarioId`、`ScenarioNodeRole`、`ClusterAnswers`）
- Modify: `src/data/scenarios.json`（追加 `cluster` 登记）
- Test: `tests/scenarioData.test.ts`

**Interfaces:**

- Produces:
  - `ScenarioId = 'single-standalone' | 'replica-sentinel' | 'cluster'`
  - `ScenarioNodeRole` 追加 `'node1' … 'node6'`
  - `ClusterAnswers { profile; tier?; budgetMb?; persistence; access: 'intranet' | 'public'; nodeIp?; password? }`
  - `scenarios.json.cluster`：`name`「三主三从集群」、`summary`、`tiers` 五档、`persistence` 四档、`access` 两档（内网 / 公网）、`reasons`（含 `cluster-enabled`、`cluster-require-full-coverage`、`cluster-config-file`、`requirepass`、`masterauth` 等）、`checklist` 静态项（建目录、overcommit、THP、端口放行、跨机替换地址、复核命令）。

- [ ] **Step 1: 写失败测试** `tests/scenarioData.test.ts` 追加：`cluster` 已登记且 `name` / `summary` 非空；`access` 仅 `intranet` / `public`；`persistence` 四档；`tiers` 五档；`checklist` 每项 `title` / `command` / `why` 非空，且含端口放行与跨机替换地址两条。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/scenarioData.test.ts` Expected: FAIL（登记项缺失）。
- [ ] **Step 3: 实现** 按 Interfaces 扩展类型与登记表。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: PASS。

### Task 2: applyCluster 与 create 命令纯函数

**Files:**

- Modify: `src/lib/scenario.ts`
- Test: `tests/scenario.test.ts`

**Interfaces:**

- Consumes: Task 1 类型；`DictFile`；`scenarios.json`。
- Produces:
  - `CLUSTER_ID = 'cluster'`
  - `emptyClusterAnswers(): ClusterAnswers`
  - `applyCluster(answers, dict): { common; nodes; reasons }`（6 个 `kind: 'redis'` 节点）
  - `clusterReady(answers): boolean`、`clusterStepReady(stepId, answers): boolean`
  - `clusterCreateCommand(answers): string`
  - `clusterChecklist(answers): ScenarioChecklistItem[]`

- [ ] **Step 1: 写失败测试** `tests/scenario.test.ts` 追加：
  - 节点清单 6 个、全部 `kind: 'redis'`、文件名 / 端口 / 标题按基线表。
  - 公共值：`cluster-enabled yes`、`cluster-require-full-coverage no`、`bind` 按 IP、`requirepass` 与 `masterauth`、`maxmemory` 75%、持久化四档组合。
  - 节点覆盖：`port`、`dir /var/lib/redis/<端口>`、`logfile`、7.4 下含 `cluster-config-file nodes-<端口>.conf`，6.2 下不含该键；任何节点都不含 `replicaof`。
  - `clusterCreateCommand`：含 6 个 `<IP>:端口`、`--cluster-replicas 1`、`-a '<密码>'`。
  - `clusterChecklist`：首项为 create 命令，且长度 = 登记表清单 + 1。
  - readiness：IP 空 / 密码空 → false；资源无基数 → false；`clusterStepReady` 按三个步 id 分流。
  - fast-check：10 个版本 × 随机答案，节点值键全部在字典内。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/scenario.test.ts` Expected: FAIL（函数未定义）。
- [ ] **Step 3: 实现** 公共值复用单机 / 哨兵同一套内存与持久化计算；节点覆盖按基线表；`cluster-config-file` 由字典存在性决定。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: PASS。

### Task 3: 步骤模型扩展

**Files:**

- Modify: `src/lib/configurator.ts`（`SCENARIO_STEPS_BY_ID` 增加 `cluster`）
- Test: `tests/configurator.test.ts`

- [ ] **Step 1: 写失败测试**：`buildSteps(dict, { scenario: true, scenarioId: 'cluster' })` 比 `buildSteps(dict)` 多 3 步，id 依次 `__cluster_resource__` / `__cluster_persistence__` / `__cluster_network__`，`kind` 为 `'scenario'`，其余步骤与现状一致。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/configurator.test.ts` Expected: 新用例 FAIL。
- [ ] **Step 3: 实现** 在 `SCENARIO_STEPS_BY_ID` 补 `cluster` 三项（标题：资源 / 持久化 / 网络与认证）。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: PASS。

### Task 4: 问卷 UI 与页面接线

**Files:**

- Modify: `src/components/configurator/VersionStep.tsx`（第三个场景入口）
- Modify: `src/components/configurator/ScenarioStep.tsx`（cluster 三步分支）
- Modify: `src/components/configurator/ConfiguratorPage.tsx`（创建 / 写入 / 生成 / 闸门 / 清单）
- Test: `tests/configuratorPage.test.tsx`

**Interfaces:**

- Consumes: Task 2 `emptyClusterAnswers / clusterReady / clusterStepReady / applyCluster / clusterChecklist`；Task 3 `buildSteps`。
- Produces:
  - `VersionStep` 三个入口：「单机单实例」「一主二从三哨兵」「三主三从集群」；`scenarioActive` 时当前场景按钮文案「继续场景问卷」。
  - 页面 `generate()` 按场景 id 分三支；`checklist` 集群场景取 `clusterChecklist(answers)`；`generateStepId` 集群为 `__cluster_network__`。

- [ ] **Step 1: 写失败页面测试**：三个入口存在；点「三主三从集群」进资源步且导航出现 3 个问卷步；混部 2 GB → 混用 → 内网 IP + 密码 → 生成直达完成页；IP 或密码为空时「生成配置」禁用。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/configuratorPage.test.tsx` Expected: 新用例 FAIL。
- [ ] **Step 3: 实现** ScenarioStep 复用资源 / 持久化问题组件；网络与认证步含节点内网 IP、密码、内网 / 公网单选与跨机部署提示。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: 全部 PASS。

### Task 5: 完成页 6 文件与初始化命令

**Files:**

- Modify: `src/components/configurator/ConfiguratorPage.tsx`（`files` 对 cluster 生效；清单含动态 create 项）
- Test: `tests/configuratorPage.test.tsx`（集群完成页断言）

- [ ] **Step 1: 写失败测试**：集群完成后 6 个标签；主库 1 预览含 `cluster-enabled yes` 与 `port 7000`；从库 1 预览含 `port 7003` 且不含 `replicaof`；清单含 `--cluster-replicas 1` 与「放行节点端口」；隐藏「带回体检页」。
- [ ] **Step 2: 运行确认失败** Run: `npx vitest run tests/configuratorPage.test.tsx` Expected: 新用例 FAIL。
- [ ] **Step 3: 实现** `files` 的判定从「哨兵场景」放宽为「有 nodes 的场景」；哨兵文件仍走 `renderSentinelConfig`，其余节点走 `renderConfig`。
- [ ] **Step 4: 运行确认通过** Run: 同上 Expected: 全部 PASS。

### Task 6: 文档同步与全量验证

**Files:**

- Modify: `README.md`（第三个场景入口、3 步问卷、6 份文件、create 命令）
- Modify: `docs/superpowers/specs/2026-11-19-configurator-design.md`、`2026-11-26-configurator-replication-sentinel-design.md`、`2026-11-26-configurator-scenario-single-design.md`（非目标中的「集群」条目改为链接本设计）
- Modify: 本计划文件头（状态）

- [ ] **Step 1: 同步文档** README 只写用户可见行为。
- [ ] **Step 2: 全量验证** Run: `npm run check`、`npm run build`。
- [ ] **Step 3: 收尾** spec 状态改「已实现」，本文件头标「状态：已实现」。
