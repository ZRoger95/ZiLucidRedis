# 配置向导场景预设：三主三从切片集群设计

日期：2026-11-27
状态：已实现
范围：`/configurator` 新增第三个场景「切片集群」（Redis Cluster），基线固定为 3 主库 + 3 从库，共生成 6 份 `redis.conf`；集群的槽分配与主从关系由清单里的 `redis-cli --cluster create` 一次性完成。单机单实例、一主二从三哨兵两个场景与逐项配置路径不变。向导整体设计见 [2026-11-19-configurator-design.md](2026-11-19-configurator-design.md)，单机场景见 [2026-11-26-configurator-scenario-single-design.md](2026-11-26-configurator-scenario-single-design.md)，哨兵场景见 [2026-11-26-configurator-replication-sentinel-design.md](2026-11-26-configurator-replication-sentinel-design.md)。

## 1. 意图：为什么做

单机与哨兵解决的是「一个写入口」的起点；数据量或写入量超过单机、或者需要水平扩展时，下一步就是分片集群。新手面对集群时真正要决策的仍然只有四件事：给多少资源、数据能不能丢、节点之间怎么互通、以及**槽怎么分、主从怎么配**——最后这件事不在 conf 里，而在一条 `cluster create` 命令里，这正是最容易漏掉、漏了集群就不可用的一步。

本场景把这些收成 3 问 + 一份带命令的清单，产出 6 份可直接启动的节点配置。

## 2. 现状

- 场景骨架由三个场景共享：`ScenarioState`（[types.ts](../../../src/types.ts)）带 `id`、`answers`、`applied`、可选 `nodes[]`；完成页 `files` 走 `tabs` 多文件预览与逐份下载（[FinishStep.tsx](../../../src/components/configurator/FinishStep.tsx)）。本设计新增第三个场景，前两个是单机单实例与一主二从三哨兵。
- 字典里有集群指令：`REDIS CLUSTER` 与 `CLUSTER DOCKER/NAT support` 两个区域，10 个版本都有 `cluster-enabled`、`cluster-node-timeout`、`cluster-require-full-coverage`、`cluster-migration-barrier`、`cluster-announce-ip/port/bus-port`；`cluster-config-file`、`cluster-port`、`cluster-preferred-endpoint-type` 从 7.0 起才有，**6.2 字典缺 `cluster-config-file`**。
- 敏感值守卫（`draftForStorage`、`secrets.ts`、`persistence.ts`）已覆盖 `requirepass` / `masterauth` 与节点快照，集群场景复用即可。

## 3. 目标

- 版本页出现第三个场景入口「三主三从集群」，与现有两个入口并列；已有该场景草稿时显示「继续场景问卷」。
- 3 步问卷（资源、持久化、网络与认证）答完直达完成页。
- 产出 6 份文件：主库 1–3、从库 1–3；每份都开集群、带各自的端口与集群配置文件，6 份走同一套 `renderConfig` 管线（公共值 + 节点覆盖值）。
- 完成页 6 个标签预览并逐份下载；系统层清单第一条给出可直接复制的 `redis-cli --cluster create` 命令（含槽分配与 `--cluster-replicas 1`）。
- 密码在 6 个节点间一致复用；明文不落盘。

## 4. 非目标

- Cluster 扩容 / 缩容 / reshard / rebalance 指引；`--cluster add-node` 之类的运维命令。
- `cluster-announce-ip` 逐节点填写（跨机部署靠清单提示手改）；逐节点收集 6 个地址。
- Cluster TLS（`cluster-tls`、`cluster-announce-tls-port`）、`sentinel` 与 cluster 混用。
- 分角色不同密码、ACL `user` 生成、`cluster-allow-reads-when-down` 等高级开关调优。
- 真实连通性与槽迁移校验；zip 打包下载；本场景「带回体检页」。

## 5. 已选方案

已选：**方案 A —— 复用现有场景骨架，6 个节点全部走 `renderConfig`，槽分配放进清单命令**。

- 集群的槽与主从关系不能写进 `redis.conf`，写进去也没用；所谓「节点是主是从」只在 `cluster create` 时确定。因此 6 份文件只在端口、目录、日志、集群配置文件上不同，其余一致，这与 Redis 集群的实际部署方式吻合。
- 复用 `files` + `tabs` 完成页，不新增第二套预览/下载。

被放弃的方案：

- **方案 B（独立集群生成器 + 自带拓扑编辑器）**：会与现有场景状态、守卫、预览、下载形成两套平行实现，违背 [2026-11-19 设计](2026-11-19-configurator-design.md)「预设只是值层」的定位。
- **方案 C（3 主 0 从）**：只需 3 份配置，但任一节点宕机就有 1/3 槽位不可写、没有自动接管，对「可用」这个前提不成立；只在资源极紧时才考虑，留作后续可选档位。
- **方案 D（把槽分配写进 `cluster-config-file` 手工预置）**：`nodes.conf` 由节点自己维护、格式不稳定，手写等于造一份官方明确说「不要手改」的文件。

## 6. 拓扑基线

| 角色     | 端口 | 文件名                     | 标题   | 槽位        |
| -------- | ---- | -------------------------- | ------ | ----------- |
| master1  | 7000 | `redis-master1-7000.conf`  | 主库 1 | 0–5460      |
| master2  | 7001 | `redis-master2-7001.conf`  | 主库 2 | 5461–10922  |
| master3  | 7002 | `redis-master3-7002.conf`  | 主库 3 | 10923–16383 |
| replica1 | 7003 | `redis-replica1-7003.conf` | 从库 1 | 跟随主库 1  |
| replica2 | 7004 | `redis-replica2-7004.conf` | 从库 2 | 跟随主库 2  |
| replica3 | 7005 | `redis-replica3-7005.conf` | 从库 3 | 跟随主库 3  |

- 集群总线端口 = 业务端口 + 10000（17000–17005），默认规则，不需要额外指令。
- 槽位由 `--cluster create` 均分（5461 / 5461 / 5462）；主从由 `--cluster-replicas 1` 按「前 3 个是主、后 3 个各挂一个」确定，命令里节点顺序就是上表顺序。

## 7. 问卷（3 步）

1. `__cluster_resource__` 资源：部署画像（独占 / 混部）+ 规格档位或内存预算；与单机场景一致。
2. `__cluster_persistence__` 持久化：不开 / 仅 RDB / 仅 AOF / 混用。
3. `__cluster_network__` 网络与认证：访问面（内网 / 公网，无「仅本机」）、节点内网 IP、连接密码。

闸门：节点 IP 与密码都非空才可「生成配置」；资源步要有内存基数。刷新后密码丢失时，完成页给「密码未填，当前配置将无认证」警告，下载前确认。

## 8. 数据模型与函数

```ts
export type ScenarioId = 'single-standalone' | 'replica-sentinel' | 'cluster';
export type ScenarioNodeRole = ... | 'node1' | 'node2' | 'node3' | 'node4' | 'node5' | 'node6';

export interface ClusterAnswers {
  profile: ScenarioProfile;
  tier?: string;
  budgetMb?: number;
  persistence: ScenarioPersistence;
  access: 'intranet' | 'public';
  nodeIp?: string;
  password?: string;
}
```

新增纯函数（[scenario.ts](../../../src/lib/scenario.ts)）：

- `CLUSTER_ID = 'cluster'`
- `emptyClusterAnswers(): ClusterAnswers`（独占 / 不开持久化 / 内网）
- `applyCluster(answers, dict): { common, nodes, reasons }`
- `clusterReady(answers): boolean`、`clusterStepReady(stepId, answers): boolean`
- `clusterCreateCommand(answers): string`
- `clusterChecklist(answers): ScenarioChecklistItem[]`（登记表清单 + 头部动态 create 命令项）
- 节点元数据常量 `CLUSTER_NODE_META`（角色 / 端口 / 文件名 / 标题）

## 9. 指令与理由

公共值（6 个节点一致）：

| 指令                                  | 值                                                         | 理由                                                                 |
| ------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `cluster-enabled`                     | `yes`                                                      | 只有以集群模式启动才能加入集群                                       |
| `cluster-require-full-coverage`       | `no`                                                       | 一组主从整体不可用时其余槽位仍可读写；代价是客户端可能读到部分键缺失 |
| `bind`                                | `<节点 IP> 127.0.0.1 -::1`（内网）/ `0.0.0.0 -::*`（公网） | 节点间要能互通，客户端也只走这个地址                                 |
| `protected-mode`                      | `yes`                                                      | 未设密码且未绑地址时拒绝外部连接                                     |
| `requirepass` / `masterauth`          | 同一密码                                                   | 集群节点必须同密码，否则握手与故障转移失败                           |
| `supervised`                          | `systemd`                                                  | 交给系统服务托管                                                     |
| `maxmemory` / `maxmemory-policy`      | 资源 75%；开持久化 `noeviction`，不开 `allkeys-lru`        | 与单机场景同一套估算                                                 |
| `appendonly` / `save` / `appendfsync` | 随持久化四档                                               | 与单机场景同一张表                                                   |

节点覆盖值：

| 指令                  | 值                                | 说明                                                                                        |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `port`                | 7000–7005                         | 同机多实例按端口区分                                                                        |
| `dir`                 | `/var/lib/redis/<端口>`           | 每节点独立目录，避免集群配置文件与数据互相覆盖                                              |
| `logfile`             | `/var/log/redis/redis-<端口>.log` | 分节点日志                                                                                  |
| `cluster-config-file` | `nodes-<端口>.conf`               | 每节点唯一；6.2 字典没有该指令，按字典过滤规则跳过，靠独立 `dir` 下的默认 `nodes.conf` 兜底 |

从库文件**不写 `replicaof`**：集群模式的主从关系由 `cluster create` 建立，写死 `replicaof` 反而会与集群拓扑冲突。

## 10. 守卫扩展

- 复用现有 `draftForStorage`：节点快照里的 `requirepass` / `masterauth` 由字典敏感集合剔除；`answers.password` 剥离。无新增字段需要特判。
- `secrets.ts` / `persistence.ts` 无需改动：集群配置不含哨兵行。

## 11. 完成页与清单

- 6 个标签：主库 1–3、从库 1–3；下载按钮下载当前标签对应的文件；本场景隐藏「带回体检页」（多文件无法单文件交接）。
- 系统层清单第一条（动态）：

```
redis-cli -a '<密码>' --cluster create <节点 IP>:7000 <节点 IP>:7001 <节点 IP>:7002 \
  <节点 IP>:7003 <节点 IP>:7004 <节点 IP>:7005 --cluster-replicas 1
```

其余清单（登记表静态项）：创建各节点数据与日志目录、允许内存过量提交、关闭透明大页、放行 7000–7005 与 17000–17005、跨机部署时把 `bind` 与 `cluster-announce-ip` 换成本机地址、用 `redis-cli -c -p 7000 cluster info` / `cluster nodes` 复核。

## 12. 约束与风险

- **单一节点 IP 的简化**：v1 只问一个节点地址，适合「一台机器多实例」或「各机器同一内网地址段按需手改」；跨机部署必须按清单逐份替换 `bind`（必要时补 `cluster-announce-ip`），否则节点互相不可达、集群建不起来。这一点在问卷与清单里都要写明。
- **6.2 缺 `cluster-config-file`**：该版本靠独立 `dir` 下的默认文件名隔离；不要为它手写指令绕过字典过滤。
- **密码必填**：集群节点密码不一致或缺失会直接导致握手失败，因此闸门比单机更严（无「仅本机」档）。
- **端口冲突**：同机 6 实例需要 7000–7005 与 17000–17005 全部空闲；清单里给出检查方式。
- **数据安全**：`cluster-require-full-coverage no` 是有意的可用性取舍，可能读到部分键缺失，理由写进「预设改了什么」。

## 13. 验收

- 版本页三个场景入口并列；点「三主三从集群」进入资源步，导航出现 3 个问卷步。
- 资源（混部 2 GB）→ 持久化（混用）→ 网络与认证（内网 IP `10.0.0.5`、密码）→ 「生成配置」直达完成页。
- 完成页 6 个标签，文件名与上表一致；主库标签预览含 `cluster-enabled yes` 与 `port 7000`，从库标签预览含 `port 7003` 且**不含** `replicaof`；7.0 及以上版本含 `cluster-config-file nodes-7000.conf`。
- 清单第一条为 `redis-cli ... --cluster create ... --cluster-replicas 1`，6 个地址顺序与上表一致；含端口放行与跨机替换地址两条。
- 节点 IP 或密码为空时「生成配置」禁用；刷新后密码丢失显示无认证警告。
- 10 个版本 × 代表性答案：6 个节点写出的指令名全部存在于该版本字典。
- 既有两个场景与逐项路径零回归；`npm run check`、`npm run build` 通过。
