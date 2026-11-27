# 配置向导场景预设：一主二从三哨兵设计

日期：2026-11-26
状态：已实现
范围：`/configurator` 新增第二个场景「一主二从三哨兵」（Redis Replication + Sentinel），基线固定为 1 主库、2 从库、3 哨兵，共生成 6 份配置文件：3 份 `redis.conf`（按角色）+ 3 份 `sentinel.conf`。单机单实例场景与逐项配置路径不变。向导整体设计见 [2026-11-19-configurator-design.md](2026-11-19-configurator-design.md)，单机场景见 [2026-11-26-configurator-scenario-single-design.md](2026-11-26-configurator-scenario-single-design.md)。

## 1. 意图：为什么做

单机场景解决了「一台 VPS 一个实例」的起点配置。另一类常见起点是高可用拓扑：主库写、从库读/容灾、哨兵自动故障转移。新手面对这种拓扑要回答的问题不是几百条指令，而是：节点怎么规划、主从怎么连、密码怎么在节点间一致、哨兵看哪个主库、多久判定下线。本场景把这些决策收成一套短问卷，产出可落地的 6 份起点配置；区域步仍保留为可选复查。

## 2. 现状

- 现有预设是单文件模型：`applyScenario` 把推荐值写入一份草稿的 `values`，`renderConfig` 从官方 redis.conf 原文渲染单份 conf，下载单个 blob。场景状态 `ScenarioState.id` 是字面量 `'single-standalone'`，问卷步由 `buildSteps` 固定插入 4 步，版本页「逐项配置」跳转索引硬编码为 5。
- 数据管线只抓 `redis.conf` + `config.c`（`data/upstream/<line>/`），字典里没有任何哨兵指令；`sentinel monitor` / `sentinel auth-pass` / `sentinel down-after-milliseconds` 等只存在于 `sentinel.conf`，语法是 `sentinel <规则> <主库名> <参数>`，不走 redis.conf 的指令落位算法。
- 敏感值机制：`secrets.ts` 按「首 token 为指令名」识别 `requirepass` / `masterauth` 等并替换为 `${env_*}`；`persistence.ts` 用正则拒绝明文落盘；`draftForStorage` 剔除 `values`、`scenario.applied` 中的敏感值并剥离 `answers.password`。**三处都不认识哨兵行**。
- 字典 REPLICATION 区已含 `replicaof`、`masterauth`、`replica-read-only`、`replica-priority` 等主从指令，6.2–8.10 版本线可用。
- 完成页当前是单预览 + 单下载按钮；「带回体检页」通过内存交接单份文本与 vault。
- shadcn 现有控件含 `tabs`，可用于多文件预览切换；不新增控件源码与运行时依赖。

## 3. 目标

- 版本页场景入口从单一按钮扩展为两个并列场景：单机单实例、一主二从三哨兵；选场景后进入各自问卷。
- 哨兵场景问卷复用资源、持久化两套问题，补拓扑相关共享输入（主库地址、访问面、密码）；答完直达完成页。
- 产出 6 份文件：主库、从库 1、从库 2 三份 redis 配置走现有 `renderConfig` 管线按角色叠加覆盖值；三份哨兵配置由纯函数按登记表生成。
- 完成页以标签页切换 6 份文件预览，逐份下载；不引打包库，v1 不做 zip。
- 密码在主库、从库、哨兵间一致复用；敏感值不落盘的守卫扩展到新字段与哨兵行。
- 覆盖全部 10 个版本线：redis 侧产出的指令必须存在于当前版本字典；哨兵规则与版本字典无关。

## 4. 非目标 / 反目标

非目标（本次不做）：

- Redis Cluster 与分片槽已在 [三主三从切片集群场景设计](2026-11-27-configurator-cluster-design.md) 落地；本场景的多副本数量仍不可选（从库固定 2、哨兵固定 3）。
- 完整 TLS 配置（证书路径、CA、端口一套字段）；公网档只给指引。
- ACL `user` 行生成、`sentinel-user` / `sentinel-pass` 哨兵间认证、按角色区分不同密码。
- 逐节点收集 IP：v1 只问主库地址；从库与哨兵自身的 announce-ip 留作清单指引。
- 单角色手动微调：区域步调整作用于三个 redis 节点的公共值，不提供只改主库或只改某个从库的编辑入口。
- 多文件打包下载、本场景的「带回体检页」交接。
- 连接真实 Redis / 哨兵做连通性与故障转移校验。
- 移动端适配、深色模式；改 `base`、加嵌套路由。

反目标（做了也算失败）：

- 明文密码出现在 localStorage 的任何角落（含节点覆盖值、哨兵规则快照、answers）。
- 预设静默覆盖用户已手动修改的值而不提示。
- 单机场景与逐项配置路径的行为发生任何变化；空草稿输出与官方 conf 逐字节一致的既有断言被破坏。
- redis 三份配置偏离官方模板顺序，或未改动行被改写。
- 哨兵理由编造官方语义：每条规则说明可对照官方 `sentinel.conf` 注释核对。
- 引入后端、运行时网络请求或 CDN 资源；新增运行时打包/压缩依赖。

## 5. 方案

已选：**方案 A —— 场景内多文件生成，redis 侧复用现有管线，哨兵侧新建窄生成器**。草稿模型扩出「按角色覆盖」一层，但封在场景状态内；现有向导、体检页、逐项路径不被牵动。

放弃的方案：

- **方案 B（独立拓扑生成器）**：问卷答案直接产 6 份文件，绕开现有草稿、复查清单、区域步。边界最干净，但草稿持久化、密码守卫、预览、下载、来源标记都要再写一遍，等于养两个平行产品；违背 11-19 设计「预设只是值层，不是第二套生成器」的既定决定。
- **方案 C（只生成主库 conf，哨兵/从库给指引）**：已被明确否决——`sentinel.conf` 必须真正生成。

### 5.1 拓扑基线与节点规划

固定基线：1 主 2 从 3 哨兵。默认端口按同机演示规划，上线跨机部署时按清单替换地址与端口。

| 角色      | 默认端口 | 文件名                     | 配置类型 | 角色特有指令                                                       |
| --------- | -------- | -------------------------- | -------- | ------------------------------------------------------------------ |
| master    | 6379     | `redis-master-6379.conf`   | redis    | 无 `replicaof`                                                     |
| replica1  | 6380     | `redis-replica1-6380.conf` | redis    | `replicaof <主库地址> 6379`、`masterauth`、`replica-read-only yes` |
| replica2  | 6381     | `redis-replica2-6381.conf` | redis    | 同上                                                               |
| sentinel1 | 26379    | `sentinel1-26379.conf`     | sentinel | 哨兵规则，端口 26379                                               |
| sentinel2 | 26380    | `sentinel2-26380.conf`     | sentinel | 哨兵规则，端口 26380                                               |
| sentinel3 | 26381    | `sentinel3-26381.conf`     | sentinel | 哨兵规则，端口 26381                                               |

哨兵自动发现从库，`sentinel.conf` 里不登记从库列表；故障转移后哨兵会回写自己的配置文件，初始文件必须对 redis 运行用户可写（写入系统层清单）。

### 5.2 问卷与答案模型

哨兵场景问卷 3 步：

1. **资源**：复用独占档位 / 混部预算逻辑，预算与档位按**每个节点**落到 `maxmemory`（三个 redis 节点同规格）。
2. **持久化**：复用四档（不开 / 仅 RDB / 仅 AOF / 混用），同一组合应用到三个 redis 节点；从库独立落盘，磁盘余量提示按节点重复提示。
3. **网络与认证**：访问面只保留内网 / 公网两档（多节点必须走网络，「仅本机」在本场景不出现）；必填主库地址（IP 或主机名）；内网 / 公网都必填密码。公网档保留劝阻警告与 TLS / 危险命令指引。

答案类型按场景 id 判别：

```ts
type ScenarioId = 'single-standalone' | 'replica-sentinel';

interface ReplicaSentinelAnswers {
  profile: ScenarioProfile;
  tier?: string;
  budgetMb?: number;
  persistence: ScenarioPersistence;
  access: 'intranet' | 'public';
  masterHost?: string;
  password?: string;
}
```

readiness 闸门：资源有内存基数；网络步主库地址非空且密码非空，否则「生成配置」禁用。判定纯函数与现有 `scenarioStepReady` 同处维护，按场景 id 分流。

### 5.3 数据模型与纯函数

草稿增量扩展，保持 `v: 1`，旧草稿经 `loadDraft` 的 `emptyDraft` 合并自然兼容：

```ts
interface ScenarioNodeFile {
  role: 'master' | 'replica1' | 'replica2' | 'sentinel1' | 'sentinel2' | 'sentinel3';
  kind: 'redis' | 'sentinel';
  fileName: string;
  title: string;
  values: Record<string, string>; // redis 角色覆盖值；sentinel 侧为规则快照
}

interface ScenarioState {
  id: ScenarioId;
  answers: ScenarioAnswers; // 按 id 判别；password 除外，见守卫
  applied: Record<string, string>; // 预设写入的指令快照（单机场景沿用）
  nodes?: ScenarioNodeFile[]; // 哨兵场景的 6 个节点文件
}
```

- redis 三份：公共基础值（`supervised`、`logfile`、`dir`、`protected-mode`、`maxmemory`、`maxmemory-policy`、持久化组合、`requirepass`、`masterauth`、`bind`）由答案算出，存在 `draft.values`；角色覆盖值放在节点 `values`（从库加 `replicaof`、`replica-read-only yes`，按节点区分 `port` / `dir` / `logfile`）。渲染时合并公共值与角色覆盖值，交给现有 `renderConfig(official, dict, draft)`，算法零改动。区域步手动编辑只改公共值，三个 redis 节点同时生效（见非目标）。
- 哨兵三份：新纯函数 `renderSentinelConfig(answers, registry, sentinelIndex): string`，按登记表拼固定结构文本，不走官方模板落位。
- 新纯函数 `applyReplication(answers, dict)`：返回 `{ nodes, reasons }`；redis 节点覆盖值经版本字典已知集合过滤，缺失跳过并在复查清单标注（与单机场景同一规则）。
- `src/lib/scenario.ts` 内按场景 id 分流；单机现有函数与行为保持不变。

### 5.4 哨兵登记表

新增人工登记表 `src/data/sentinel-rules.json`（人工维护数据，遵守「生成数据不手改」边界；AGENTS.md 人工维护清单同步补登）。登记内容：

- 主库名 `mymaster`、quorum 2、`down-after-milliseconds` 默认 30000、`failover-timeout` 默认 180000（3 分钟）、`parallel-syncs` 默认 1，对照官方 `sentinel.conf` 注释核对。
- 每条规则的中文说明、参数模板、是否敏感（`auth-pass` 为敏感）。
- 生成的哨兵文件基础行：`port <哨兵端口>`、`bind 127.0.0.1 -::1`、`protected-mode yes`、`dir`、`supervised systemd`、`logfile`（按节点分文件）。
- 规则行：`sentinel monitor mymaster <主库地址> 6379 2`、`sentinel auth-pass mymaster <密码>`（填密码时才写）、`sentinel down-after-milliseconds`、`sentinel failover-timeout`、`sentinel parallel-syncs`。
- `sentinel announce-ip` / `sentinel announce-port` 不生成生效行，作为清单指引（NAT / 容器环境才需要）。

v1 不从上游抓取 `sentinel.conf`；登记表为人工维护，数据测试断言规则齐全、说明非空、敏感标记正确。

### 5.5 敏感值守卫扩展（安全关键）

- **secrets 识别扩展**：`sentinel auth-pass <主库名> <密码>` 行需识别并替换第三个 token 为 `${env_auth-pass}`（或沿用现有敏感命名约定，实现时定）；现有 `requirepass` / `masterauth` 路径不变。
- **persistence 正则扩展**：明文哨兵密码行同样拒绝持久化。
- **draftForStorage 扩展**：剥离 `answers.password`；剔除 `applied`、每个 `nodes[].values` 中的敏感指令与哨兵密码快照。
- 性质测试（`tests/*.property.test.ts`）的「持久化无明文」不变量扩展到节点值与哨兵快照；先补能复现泄漏的测试再改实现。
- 刷新后密码字段为空，问卷与完成页提示「敏感值不保存，请重新填写」；密码缺失时完成页红色警告，下载仍可继续（沿用单机场景的不硬阻断口径）。

### 5.6 流程与导航

- 版本页：两个场景入口并列（单机单实例 / 一主二从三哨兵），入口文案说明各自产出；已有场景草稿时按钮显示「继续场景问卷」。「逐项配置」不创建 scenario。
- `buildSteps(dict, { scenario?: boolean; scenarioId?: ScenarioId })`：按场景 id 插入各自问卷步；移除「逐项配置跳索引 5」的硬编码，改为定位第一个区域步索引。
- 问卷答案逐步写入 `draft.scenario.answers` 并持久化（密码除外）；网络步「下一步」即「生成配置」，调用 `applyReplication` 写入节点快照并跳到完成页。
- 重新回答问卷：覆盖本场景预设拥有的指令键与节点快照，非预设键不动；事前提示「重新回答会覆盖预设项的修改」，不做保留合并。
- 完成页：`tabs` 切换 6 份文件，标签显示角色标题与文件名；预览当前文件；下载按钮下载当前文件。「带回体检页」在本场景隐藏（多文件交接为非目标）。
- 复查清单：redis 公共预设按现有分组与「去修改」跳转呈现；哨兵规则在对应标签预览中可见。系统层清单追加：三哨兵跨机器部署、哨兵配置文件可写、端口放行（6379/6380/6381、26379–26381）、启动命令 `redis-server <文件> --sentinel`、NAT 环境补 announce-ip。

### 5.7 控件与呈现

- 问卷单选卡沿用 shadcn `radio-group` + 整卡 `label`；档位 / 单位用现有 `Select`，地址 / 密码 / 预算用现有 `Input`；帮助文案用现有 `Callout` / 折叠块。
- 多文件预览用现有 shadcn `tabs`；样式全 Tailwind；不新增图效依赖。
- 界面文案中文；最小宽度 1024px 不变。

## 6. 约束与风险

- **地址占位**：v1 只收集主库地址；从库 / 哨兵自身地址未填，生成文件在跨机部署前不能直接启动，清单必须明确「上线前替换地址与端口」。主库地址为空时闸门阻断。
- **密码一致约束**：哨兵监控要求主从密码一致（官方 `auth-pass` 说明），v1 单一密码复用三处；不提供分角色密码。
- **哨兵回写配置**：初始 `sentinel.conf` 必须对运行用户可写；文件权限与属主写入清单。
- **从库持久化**：同一持久化组合落到从库，磁盘与 fork 余量按节点评估；小内存警告在资源步沿用。
- **守卫先行**：5.5 三处剔除先有复现测试再改实现；性质测试覆盖新字段。
- **版本过滤**：redis 侧每条覆盖指令必须存在于当前版本字典；哨兵规则不受字典约束，但登记表变更要过数据测试。
- **回归保护**：单机场景测试、逐项路径测试、空草稿逐字节断言必须保持全绿；`renderConfig` 输出算法零改动。
- **内容维护**：哨兵规则说明须可对照官方 `sentinel.conf` 注释；不抄长段上游注释，只保留结论与参数含义。

## 7. 留给实现者的决定

- 公共值与角色覆盖的存储划分已定：`draft.values` 存公共 redis 基础值，`nodes[].values` 存角色覆盖；实现时按此合并。
- 从库 `bind` 取值与从库 announce 处理：初步提议主库绑定「主库地址 + loopback」，从库绑定 loopback + 主库地址，自身网卡地址留给区域步与清单调整。
- 从库是否显式写入独立 `port` / `dir` / `logfile`（同机演示需要区分）；初步提议显式写入。
- 复查清单在多角色下的粒度（公共指令一组，角色特有指令随节点标签）。
- 哨兵密码占位符的命名（沿用 `env_masterauth` 风格还是新增 `env_auth-pass`）。

## 8. 验收

- 版本页出现两个场景入口；「逐项配置」路径的步骤、计数、完成页与改动前一致（现有测试全绿）。
- 哨兵场景走完 3 步直达完成页；完成页 6 个标签对应 3 份 redis 配置 + 3 份哨兵配置，逐份预览与下载。
- 10 个版本 × 代表性答案：redis 节点覆盖指令全部存在于该版本字典；从库配置含 `replicaof <主库地址> 6379` 与 `masterauth`；哨兵文件含 `monitor` / `auth-pass`（填密码时）/ `down-after-milliseconds` / `failover-timeout` / `parallel-syncs`，quorum 为 2，三份哨兵端口分别为 26379 / 26380 / 26381。
- 未填主库地址或密码不能进入完成页；填密码后刷新：`values`、`applied`、`nodes[].values`、`answers` 四处均搜不到明文。
- 预设字段带来源标记；区域步改值后变「已手动修改」；重答问卷覆盖预设项且有提示。
- `renderConfig` 输出算法零改动；空草稿输出与官方 conf 逐字节一致的既有断言仍全绿。
- `npm run check` 与 `npm run build` 通过。
