# 配置向导场景预设：单机单实例设计

日期：2026-11-26
状态：已实现
范围：`/configurator` 新增「从场景开始」入口与单机单实例场景问卷（4 问），问卷答案批量写入草稿推荐值，答完直达完成页；完成页新增预设复查清单与系统层清单。不改 `renderConfig` 输出算法、不改体检页、不新增导出物。向导整体设计见 [2026-11-19-configurator-design.md](2026-11-19-configurator-design.md)，步骤骨架见 [2026-11-20-configurator-step-skeleton-design.md](2026-11-20-configurator-step-skeleton-design.md)。

## 1. 意图：为什么做

现有向导是「版本 → 26 个区域逐区填空 → 完成」，约 29 步。没有 conf 的新手面对的是几百条指令的填空题，而单机单实例部署真正需要决策的只有四件事：机器是独占还是混部、能给 Redis 多少资源、数据能不能丢、谁来连。场景预设把这三四十步的「走」变成 4 问 + 1 个完成页，区域步全部保留为可选复查。

本次只做第一个场景：**单机单实例**（一台 VPS 一个 Redis 实例），含独占 / 混部两个部署画像。哨兵主从场景见 [一主二从三哨兵场景设计](2026-11-26-configurator-replication-sentinel-design.md)；集群、其余多实例不做。

## 2. 现状

- 草稿模型 `ConfiguratorDraft`（[types.ts](../../../src/types.ts)）：`values` 只记录改动过的指令；`renderConfig` 永远从官方原文渲染，未改动行逐字节保留（[configurator.ts](../../../src/lib/configurator.ts)）。预设本质是批量写入 `values`，输出算法一行不用改。
- 持久化守卫 `draftForStorage`（[configuratorState.ts](../../../src/lib/configuratorState.ts)）按字典 `sensitive` 标记剔除 `values` 中的敏感值并清空 `user` 自由行。**它只认 `values`，不认识任何新字段**——草稿扩展后必须同步扩展守卫。
- 官方模板的生效行：`bind 127.0.0.1 -::1`、`protected-mode yes`、`logfile ""`、`dir ./`、`appendonly no`；`save` 与 `supervised` 在模板中是注释，生效默认取 config.c（`save 3600 1 300 100 60 10000`、`supervised no`）。字典里 `bind` 的 `defaultValue` 是空串（config.c 语义 = 监听全部网卡），与模板生效行不一致，预设不能拿字典默认值当「模板现状」。
- 每条指令已有中文摘要（`zh-notes.json`）与官方原文折叠块；问卷选项的帮助文案可复用这套材料，不需要新写科普内容。
- shadcn 控件现有 button / select / switch / radio-group / input / textarea / tabs / dialog / tooltip 等；问卷单选卡用 `label` 包住整卡，点文字右侧空白也选中。
- 11-19 设计把「场景预设」列为非目标，本设计正式将其纳入；11-19 与 11-20 的非目标清单随本设计实现同步更新。

## 3. 目标

- 版本步提供两个入口：「从场景开始」（推荐）与「逐项配置」（现有行为不变）。
- 单机单实例问卷 4 问：部署画像 → 资源 → 持久化 → 访问面；答完直达完成页。
- 问卷答案经纯函数算出一批推荐值写入草稿；完成页新增「预设改了什么」分组复查清单（按区域分组，每条含指令、新值、一句理由、「去修改」跳转）与系统层必做项清单。
- 左侧导航保留全部区域步与改动计数，任意区域步可随时进入微调；被预设填过的字段带来源标记，用户改过的带「已手动修改」标记。
- 内网 / 公网访问强制设密码；密码走现有敏感值机制，明文不落盘。
- 覆盖全部 10 个版本线（6.2–8.10）：预设只产出当前版本字典里存在的指令。

## 4. 非目标 / 反目标

非目标（本次不做）：

- 其他场景族：多实例、容器编排；哨兵主从已在 [一主二从三哨兵场景设计](2026-11-26-configurator-replication-sentinel-design.md) 落地，切片集群已在 [三主三从切片集群场景设计](2026-11-27-configurator-cluster-design.md) 落地。
- 完整 TLS 配置（证书路径、CA、端口一套字段）；公网档只给指引，具体字段留给 TLS/SSL 区域步。
- 自动生成 ACL `user` 行或 `rename-command` 行；危险命令只给指引，留给 SECURITY 步。
- 问卷提示文案的精雕（v1 用登记表摘录的官方注释中译，文案后续迭代）。
- 新导出物：conf 仍是唯一下载物，系统层清单只是完成页内容。
- 移动端适配、深色模式；改 `base`、加嵌套路由。
- 连接真实 Redis 校验。

反目标（做了也算失败）：

- 明文密码出现在 localStorage 的任何角落（包括草稿新增字段）。
- 预设静默覆盖用户已手动修改的值而不提示。
- 「逐项配置」路径的行为因本次改动发生任何变化。
- 生成 conf 偏离官方模板顺序，或未改动行被改写。
- 预设理由编造官方语义：每条理由必须能从官方 conf 注释或 config.c 语义核对。
- 引入后端、运行时网络请求或 CDN 资源。

## 5. 方案

已选：**方案 B —— 问卷后直达完成页，区域步变可选复查**。问卷与逐项共用同一份草稿、同一个 `renderConfig`；预设只是值层，不是第二套生成器。

放弃的方案：

- **方案 A（问卷当前置步骤，之后仍逐区走）**：新 UI 最少，但核心痛点没解决——用户还是要点 29 步，只是每步从填空变确认。
- **静态模板一键套用**：档位 × 持久化 × 访问面组合爆炸，且答不了混部「给 Redis 多少内存」这个必填项。
- **独立 `/scenario` 页面**：草稿、渲染、导出、敏感值机制全要重建一遍；`/configurator` 已有全部基础设施。

### 5.1 问卷四问（已确认的产品决策）

**Q1 部署画像**：独占 VPS / 与其他服务混部。

**Q2 资源**（随 Q1 分叉）：

- 独占：选规格档位（1C1G / 2C2G / 2C4G / 4C8G / 8C16G），与购买 VPS 的语言一致。`maxmemory` = 档位内存 × 75%（官方建议留 25% 余量给系统与碎片），格式化為人读单位（768mb / 1536mb / 3gb / 6gb / 12gb）。
- 混部：填一个数字「打算给 Redis 多少内存」+ 单位（MB / GB），旁附估算提示（总量减去其他服务常驻再留余量）。档位对混部无意义，不出现。预算按整段数字校验，`2abc` 这类尾随字符视为非法，行内提示且下一步禁用；编辑期间保留原始文本（GB 可输小数），失焦后按单位回显，GB 最多两位小数。
- CPU 与磁盘不问：v1 预设不碰 `io-threads` 等 CPU 相关指令（保持官方默认）；磁盘风险用警告兜底——开持久化时提示「磁盘剩余空间要够数据集的 2–3 倍（RDB + AOF 重写同时落盘）」。
- ≤1G 档位 / 预算：警告 fork 可能失败、持久化慎开（小内存特例）。

**Q3 持久化**：不开 / 仅 RDB / 仅 AOF / 混用。选项旁挂官方注释帮助（复用 zh-notes 材料），用户不懂 AOF/RDB 时能就地了解。四档对应的指令组合：

| 选项   | appendonly | save       | 崩溃丢失                |
| ------ | ---------- | ---------- | ----------------------- |
| 不开   | no         | `""`       | 重启清空                |
| 仅 RDB | no         | 默认快照点 | 最近几分钟              |
| 仅 AOF | yes        | `""`       | 约 1 秒                 |
| 混用   | yes        | 默认快照点 | 约 1 秒，RDB 保快速重启 |

联动（已确认）：不开持久化 → `maxmemory-policy allkeys-lru`；开持久化 → `noeviction`（官方默认）。用户可在 MEMORY MANAGEMENT 区域步覆盖。

**Q4 访问面**：仅本机（默认）/ 内网访问 / 公网直连。

- 仅本机：`bind 127.0.0.1 -::1`（与模板生效行一致），不设密码也安全；unixsocket 只给指引不代填。
- 内网：填内网 IP，`bind <ip> 127.0.0.1 -::1`；**密码必填**；附防火墙提示「只放行可信 IP」。
- 公网：顶部警告先劝阻；继续则 `bind 0.0.0.0 -::*` + **密码必填** + 危险命令与 TLS 指引（checklist 式文案，不生成 ACL 行、不代填证书）。
- `protected-mode yes` 三档都显式写入（与模板一致，复查清单可见）。

### 5.2 预设写入策略

`applyScenario` 显式写入核心指令集（约 12 条），**不比较默认值、不做「与默认相同则跳过」**：

- GENERAL：`supervised systemd`、`logfile /var/log/redis/redis-server.log`
- NETWORK：`bind`（按访问面）、`protected-mode yes`、`requirepass`（仅内网 / 公网）
- MEMORY MANAGEMENT：`maxmemory`（按资源答案）、`maxmemory-policy`（按持久化联动）
- SNAPSHOTTING：`save`（按持久化）、`dir /var/lib/redis`
- APPEND ONLY MODE：`appendonly`（按持久化）、`appendfsync everysec`（仅开 AOF 时）

取舍：与官方默认相同的值也会取消注释写入。代价是「已改 N 项」包含预设项、conf 里多出几行与默认等值的生效行；收益是复查清单与 `values` 一一对应、逻辑无需处理「字典默认 ≠ 模板生效行」（bind）的特例，新手也能在 conf 里直接看到场景设了什么。`daemonize`、`port`、`tcp-backlog`、慢日志等保持官方默认不写入（默认已合理）。

路径类值（logfile / dir）附理由「路径需存在且 redis 运行用户可写」；系统层清单里给创建命令。

理由文案为登记表静态文案；`maxmemory` 等含具体数值的理由由 `applyScenario` 拼入答案摘要（如「2C4G 档位 × 75%」）（评审决定）。

版本过滤：产出的每条指令必须存在于当前版本字典；缺失则跳过并在复查清单标注（v1 核心集在 6.2–8.10 均存在，此规则为未来上游变动兜底）。

### 5.3 数据模型与纯函数

新增人工登记表 `src/data/scenarios.json`：场景定义、档位表（ramMb）、持久化四档组合、访问面三档组合、每条预设值的中文理由、系统层清单（overcommit / THP / somaxconn / nofile / swap，含命令与原因）、问卷选项帮助文案。属人工维护数据，遵守「生成数据不手改」边界。

新增纯函数模块 `src/lib/scenario.ts`（`src/lib` 禁 React 依赖）：

```ts
interface ScenarioAnswers {
  profile: 'dedicated' | 'shared';
  tier?: string;            // 独占档位 id
  budgetMb?: number;        // 混部内存预算（统一换算为 MB）
  persistence: 'off' | 'rdb' | 'aof' | 'mixed';
  access: 'local' | 'intranet' | 'public';
  bindIp?: string;          // 内网 IP
  password?: string;        // 仅内存，不落盘
}

interface ScenarioState {
  id: 'single-standalone';
  answers: ScenarioAnswers;        // password 除外，见守卫
  applied: Record<string, string>; // 预设写入的指令快照，用于来源标记与覆盖检测
}

applyScenario(answers: ScenarioAnswers, dict: DictFile): {
  values: Record<string, string>;
  reasons: Record<string, string>;
}
```

草稿扩展：`ConfiguratorDraft` 增加可选字段 `scenario?: ScenarioState`，**保持 `v: 1`**（纯增量，旧草稿经 `loadDraft` 的 `emptyDraft` 合并自然兼容）。`emptyDraft` 不含 scenario。

`buildSteps(dict, opts?: { scenario?: boolean })`：scenario 为真时在版本步后插入 4 个 `kind: 'scenario'` 问卷步（id `__scenario_profile__` / `__scenario_resource__` / `__scenario_persistence__` / `__scenario_access__`），区域步、MISC、完成页不变。`ConfiguratorStep.kind` 联合类型加 `'scenario'`。

### 5.4 敏感值守卫扩展（安全关键）

`draftForStorage` 必须同时剔除：

1. `values` 中的敏感指令（现有逻辑）；
2. `scenario.applied` 中的敏感指令（**新增**，否则 requirepass 经 applied 泄漏）；
3. `scenario.answers.password`（**新增**，answers 落盘前剥离该字段）。

刷新后密码字段为空，问卷与 SECURITY 步提示「敏感值不保存，请重新填写」。密码缺失时（如刷新后）从导航进入完成页：内网 / 公网档显示红色警告「密码未填，当前配置将无认证」，下载仍可继续，但确认弹窗追加该提示（评审决定：不硬阻断，警告优先）。

### 5.5 流程与导航

- 版本步两个入口按钮；已有场景草稿时「从场景开始」显示为「继续场景问卷」。选「逐项配置」不创建 scenario，行为与现状完全一致。
- 问卷 4 步复用 `StepHeader` 三段式骨架；每答完一步即把答案写入 `draft.scenario.answers` 并持久化（password 除外），刷新后问卷进度不丢。Q4 的「下一步」即「生成配置」，点击时 `applyScenario` 写入草稿并跳到完成页。
- 左侧导航：问卷步成组显示；区域步与改动计数照旧，任意可达；完成页随时可进。
- 重新回答问卷：重算并**覆盖**预设拥有的指令键（含用户改过的），非预设键不动；Q1 入口与问卷顶部提示「重新回答会覆盖预设项的修改」。取舍：不做「保留用户覆盖」的合并逻辑，可预测性优先。
- 字段来源标记：`values[name] === scenario.applied[name]` → 「来自场景」；不等 → 「已手动修改」；用户清空（恢复默认）→ 复查清单显示「已恢复官方默认」。标记渲染在 `DirectiveField`，逐项模式下无 scenario 时不显示。
- 完成页：场景模式下在现有预览之上新增「预设改了什么」（按 `dict.sections` 顺序分组，每条：指令名、新值、理由、「去修改」跳对应区域步）与「系统层必做项」清单；逐项模式下完成页与现状一致。

### 5.6 控件与呈现

- 问卷单选卡用现有 shadcn `radio-group`：`label` 包住整个卡片，点标题、描述或文字右侧空白都选中；选中态由 `data-state=checked` 驱动卡片边框。档位与单位用现有 `Select`；数字与 IP 用 `Input`；帮助文案用现有 `Callout` / 折叠块。
- 样式全 Tailwind；说明区组件复用 `Annotate` / `Callout`；不新增图效依赖。
- 界面文案中文；最小宽度 1024px 不变。

## 6. 约束与风险

- **守卫先行**：5.4 的三处剔除必须先有能复现泄漏的测试再改实现；性质测试（`tests/*.property.test.ts`）的「持久化无明文」不变量扩展到 scenario 字段。
- **bind 双语义**：字典默认（空 = 全部网卡）≠ 模板生效行（loopback）。预设显式写 bind 规避该坑；测试断言本地档输出含 `bind 127.0.0.1 -::1` 生效行。
- **小内存**：≤1G 时 fork 峰值（写密集可达 2 倍）可能压垮机器，警告必须出现；不阻止用户选择。
- **混部预算无法校验**：只问预算不问总量，预算合理性靠提示文案，不做硬校验。
- **重答覆盖**：用户改过预设项后重答会丢修改，靠事前提示而非事后恢复；草稿不引入历史栈。
- **内容维护**：`scenarios.json` 的每条理由须可核对官方语义；数据测试断言档位 / 四档持久化 / 三档访问面 / 核心指令集 / 系统清单登记完整，漏登记报警。
- **体积**：复用现有 `radio-group` 与场景登记表，量级小；不新增控件源码与运行时依赖。

## 7. 留给实现者的决定

- 问卷步组件拆分粒度（每问一组件或共享问卷壳）。
- maxmemory 格式化的取整细节（75% 后落到 mb 还是 gb 的阈值）。
- 导航问卷组的视觉呈现与完成页复查清单的密度。
- 内网 IP 输入的校验强度（v1 宽松校验 + 提示即可）。

## 8. 验收

- 版本步出现两个入口；「逐项配置」路径的步骤、计数、完成页与改动前一致（现有测试全绿）。
- 场景路径：4 问答完直达完成页；完成页出现预设复查清单（按区域分组、含理由与跳转）与系统层清单；conf 仍为唯一下载物。
- 10 个版本 × 代表性答案组合：`applyScenario` 产出的指令全部存在于该版本字典；本地档输出含 loopback bind 生效行；持久化四档的 appendonly / save 组合与 5.1 表一致；混部预算正确落到 maxmemory。
- 内网 / 公网未填密码不能进入完成页；填密码后刷新：values、scenario.applied、scenario.answers 三处均搜不到明文，界面提示重填。
- 预设字段带「来自场景」标记；在区域步改值后变「已手动修改」；重答问卷覆盖预设项且有提示。
- `renderConfig` 输出算法零改动；空草稿输出与官方 conf 逐字节一致的既有断言仍全绿。
- `npm run check` 与 `npm run build` 通过。
