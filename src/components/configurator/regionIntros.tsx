import type { ReactNode } from 'react';

import { Annotate } from '@/components/annotate';
import { Callout } from '@/components/callout';

const INCLUDES_CODE = ['include /path/to/local.conf # (1)', 'include /path/to/fragments/*.conf # (2)'].join('\n');

const INCLUDES_NOTES = [
  '单文件引入：按书写顺序加载，Redis 以最后处理的行生效，后加载的值覆盖先前的。',
  '通配符按字母序展开匹配到的文件；启动时无匹配则整行忽略、不报错，空目录也安全。',
];

const MODULES_CODE = [
  'loadmodule /path/to/my_module.so # (1)',
  'loadmodule /path/to/args_module.so arg1 arg2 # (2)',
].join('\n');

const MODULES_NOTES = [
  '可写多行，启动时按顺序加载；任何一个模块加载失败，Redis 会直接中止启动。',
  '路径之后的参数原样传给模块，用于模块自身的配置；不需要参数时省略。',
];

const NETWORK_CODE = ['bind 127.0.0.1 -::1 # (1)', 'port 0 # (2)', 'tcp-backlog 511 # (3)'].join('\n');

const NETWORK_NOTES = [
  '官方模板默认只监听回环；删掉 bind 行即监听所有网卡。地址前加 - 表示该网卡不存在时启动不报错。',
  'port 0 完全关闭 TCP 监听，只留 unixsocket，适合仅本机访问。',
  'backlog 队列受内核 somaxconn 上限约束，只改这里不会生效。',
];

const TLS_CODE = [
  'tls-port 6379 # (1)',
  'tls-auth-clients no # (2)',
  'tls-key-file redis.key # (3)',
  'tls-replication yes # (4)',
].join('\n');

const TLS_NOTES = [
  'TLS 监听端口；仅用 TLS 时配合 port 0 关闭明文 TCP。',
  '是否要求客户端证书：yes 双向认证，no 不要求，optional 出示才校验。',
  '服务端私钥（PEM），与 tls-cert-file 配套；带口令时填 tls-key-file-pass，敏感值不落盘。',
  '复制链路 TLS 开关，默认 no 为明文；集群总线由 tls-cluster 同理控制。',
];

const GENERAL_CODE = ['daemonize yes # (1)', 'logfile redis.log # (2)', 'databases 16 # (3)'].join('\n');

const GENERAL_NOTES = [
  '以后台守护进程运行；容器部署通常保持 no 以前台运行。',
  '日志文件路径；空串表示标准输出，daemonize 后标准输出进 /dev/null，务必显式指定文件。',
  '数据库数量，默认 16，SELECT 按 0 到 15 的索引切换。',
];

const SNAPSHOTTING_CODE = ['save 900 1 # (1)', 'save "" # (2)', 'dbfilename dump.rdb # (3)'].join('\n');

const SNAPSHOTTING_NOTES = [
  '900 秒内至少 1 个键变更即触发 BGSAVE；多条 save 行按或条件叠加。',
  'save "" 关闭全部 RDB 快照点，用于仅 AOF 或纯缓存场景。',
  'RDB 文件名，相对 dir；dir 默认工作目录，生产建议显式绝对路径。',
];

const REPLICATION_CODE = ['replicaof host 6379 # (1)', 'masterauth <pass> # (2)', 'replica-read-only yes # (3)'].join(
  '\n',
);

const REPLICATION_NOTES = [
  '声明主节点地址即成为副本；取消复制用 replicaof no one。',
  '主节点密码；导出时向导替换为 ${env_masterauth} 占位符，明文不落盘。',
  '副本默认只读，防止写入造成与主节点的数据分叉。',
];

const TRACKING_CODE = ['CLIENT TRACKING ON # (1)', 'tracking-table-max-keys # (2)'].join('\n');

const TRACKING_NOTES = [
  '客户端用该命令开启跟踪；服务端用失效表记录哪些客户端持有哪些键。',
  '失效表键数上限，默认 100 万；满后淘汰旧记录，可能带来额外失效消息。',
];

const SECURITY_CODE = [
  'rename-command KEYS "" # (1)',
  'rename-command DEBUG "" # (2)',
  'requirepass secret # (3)',
].join('\n');

const SECURITY_NOTES = [
  '危险命令改名为空串即禁用；向导在 rename-command 自由行区域输出。',
  'DEBUG 同理可禁用或改为难猜测的名字。',
  '主密码；导出时替换为 ${env_requirepass} 占位符，明文只存在于内存。',
];

const CLIENTS_CODE = ['maxclients 10000 # (1)'].join('\n');

const CLIENTS_NOTES = ['同时连接的客户端上限；超出后新连接收到错误并被关闭。'];

const MEMORY_CODE = ['maxmemory 2gb # (1)', 'maxmemory-samples 5 # (2)', 'active-expire-effort 5 # (3)'].join('\n');

const MEMORY_NOTES = [
  '内存上限；达到后按策略淘汰键，noeviction 则拒绝写入。',
  '每轮淘汰的采样键数，越大越精确也越耗 CPU；LRU/LFU 都是近似算法。',
  '主动过期清理力度 1 到 10，越高过期键清得越干净但 CPU 占用越多。',
];

const LAZYFREE_CODE = ['UNLINK mykey # (1)', 'FLUSHALL ASYNC # (2)'].join('\n');

const LAZYFREE_NOTES = [
  'UNLINK 把内存回收交给后台线程，大键不再阻塞主线程；DEL 仍是同步释放。',
  'FLUSHALL/FLUSHDB 加 ASYNC 异步清空；lazyfree-lazy-user-flush 可把 ASYNC 变为默认。',
];

const IO_CODE = ['io-threads 4 # (1)', 'io-threads-do-reads yes # (2)'].join('\n');

const IO_NOTES = [
  'IO 线程数，默认 1 即主线程独自读写；线程只并行 socket 读写与协议解析。',
  '是否让 IO 线程也承担读与解析；默认 no 时只有写路径多线程。',
];

const OOM_CODE = ['oom-score-adj yes # (1)'].join('\n');

const OOM_NOTES = ['主动为各进程设置 oom_score_adj，提示内核 OOM killer 优先杀谁。'];

const THP_CODE = ['disable-thp yes # (1)'].join('\n');

const THP_NOTES = ['启动时尝试把系统透明大页设为 never；无 sysfs 写权限时只记录警告。'];

const AOF_CODE = ['appendonly yes # (1)', 'appendfsync everysec # (2)', 'aof-use-rdb-preamble yes # (3)'].join('\n');

const AOF_NOTES = [
  '开启 AOF 持久化；写命令以 RESP 格式追加到 appendonlydir 下的增量文件。',
  'everysec 每秒 fsync 一次，崩溃最多丢一秒；always 最安全但最慢，no 交给操作系统。',
  '重写时基础部分用 RDB 前导，加载更快文件更小；增量部分仍是 RESP 命令。',
];

const SHUTDOWN_CODE = ['shutdown-on-sigterm save # (1)', 'shutdown-timeout 10 # (2)'].join('\n');

const SHUTDOWN_NOTES = [
  '收到 SIGTERM 时按 save 点存 RDB 后关闭；可改 nosave 或 force 等组合值。',
  '关闭时最多等滞后副本追平复制偏移 10 秒。',
];

const BLOCKING_CODE = ['SCRIPT KILL # (1)'].join('\n');

const BLOCKING_NOTES = ['可终止尚未执行写操作的 Lua 脚本；已写过的脚本只能 SHUTDOWN NOSAVE 停止。'];

const CLUSTER_CODE = ['cluster-enabled yes # (1)', 'cluster-port 16379 # (2)'].join('\n');

const CLUSTER_NOTES = [
  '开启集群模式；节点握手与槽分配靠 MEET / CLUSTER ADDSLOTS，本向导不编排拓扑。',
  '集群总线端口，默认客户端端口 + 10000；节点间须互通并在防火墙放行。',
];

const ANNOUNCE_CODE = ['cluster-announce-ip # (1)', 'cluster-announce-port # (2)'].join('\n');

const ANNOUNCE_NOTES = [
  '节点对外宣告的 IP；NAT/容器部署填可达地址，否则客户端与对端拿到内网地址。',
  '对外宣告的客户端端口；总线与 TLS 端口同理有 announce 变体，默认 0 跟随实际端口。',
];

const SLOWLOG_CODE = ['SLOWLOG GET 10 # (1)', 'slowlog-max-len 128 # (2)'].join('\n');

const SLOWLOG_NOTES = [
  '读最近 10 条慢日志；入 log 阈值由 slowlog-log-slower-than 控制，单位微秒。',
  '慢日志保留条数，内存队列超出淘汰最旧；0 为每条都记，负数关闭慢日志。',
];

const LATENCY_MON_CODE = ['LATENCY LATEST # (1)', 'LATENCY HISTORY fork # (2)'].join('\n');

const LATENCY_MON_NOTES = [
  '报告各来源最新延迟事件；采样阈值由 latency-monitor-threshold 控制（毫秒），0 关闭。',
  '回看指定事件（fork、command、expire 等）的延迟历史，用于定位尖峰来源。',
];

const LATENCY_TRACK_CODE = ['latency-tracking yes # (1)', 'INFO latencystats # (2)'].join('\n');

const LATENCY_TRACK_NOTES = [
  '逐命令延迟监控开关；开启后可导出百分位与直方图。',
  '导出逐命令延迟百分位（默认 p50/p99/p99.9）；列表可由 latency-tracking-info-percentiles 调整。',
];

const NOTIFY_CODE = ['notify-keyspace-events x # (1)'].join('\n');

const NOTIFY_NOTES = ['x 表示订阅过期事件；空串关闭全部通知（默认值）。'];

const ADVANCED_CODE = [
  'hash-max-listpack-entries 512 # (1)',
  'client-output-buffer-limit replica 256mb 64mb 60 # (2)',
  'hz 10 # (3)',
].join('\n');

const ADVANCED_NOTES = [
  '小对象用 listpack 紧凑编码：条目数或单值长度超阈值才转通用结构。调高省内存、写入更耗 CPU，调低反之。',
  '按 normal / replica / pubsub 各写一行，依次是硬限、软限与软限持续秒数；0 表示该项不限，超限即断开客户端。',
  '后台任务的检查频率（1 到 500）。键数多、过期集中或要求低延迟才上调，空闲时的 CPU 占用也随之增加。',
];

const DEFRAG_CODE = [
  'activedefrag yes # (1)',
  'active-defrag-threshold-lower 10 # (2)',
  'active-defrag-cycle-max 25 # (3)',
].join('\n');

const DEFRAG_NOTES = [
  '默认关闭，只有用 Redis 自带的 Jemalloc 编译才生效；也可运行时 CONFIG SET activedefrag yes 临时开启。',
  '碎片率达到该百分比才开始整理；upper 是出全力时的百分比，两者之间线性决定力度。',
  '整理过程占用的 CPU 上限百分比，越大收敛越快，对正常命令的延迟影响也越明显。',
];

const LUA_CODE = ['lua-time-limit 5000 # (1)'].join('\n');

const LUA_NOTES = ['脚本执行超过该毫秒数后开始写日志，并对其他客户端回复 BUSY；0 或负数表示不告警。'];

const GOPHER_CODE = ['gopher-enabled yes # (1)'].join('\n');

const GOPHER_NOTES = [
  '6.2 的实验特性，默认关闭：以 / 开头的 inline 请求会按 Gopher 协议返回同名键的内容；io-threads-do-reads 开启时不支持。',
];

const BACKUP_CODE = [
  'backupdirname backupdir # (1)',
  'backup-sealed-ttl 0 # (2)',
  'preload-file aof:/tmp/restore/appendonly.aof.manifest # (3)',
].join('\n');

const BACKUP_NOTES = [
  'BACKUP 的输出目录名（不是绝对路径），实际落在 dir 之下；只在启动时读取，CONFIG SET 改不了。',
  '封存后的备份保留秒数，0 为不自动清理：等外部上传完成后显式 BACKUP CLEANUP。',
  '启动时预加载指定 RDB、AOF 或 manifest 用于恢复；设置后跳过 appendonlydir 与 dump.rdb，目标缺失则启动失败。',
];

const MISC_CODE = ['client-default-resp 3 # (1)', 'watchdog-period 0 # (2)', 'key-load-delay 0 # (3)'].join('\n');

const MISC_NOTES = [
  'config.c 注册但官方 conf 没收录的指令，本区列出的都是这种；确认可用后再改。',
  '调试类开关：周期发信号，卡死时留下堆栈；生产保持 0。',
  '加载 RDB/AOF 时每个键人为延迟的微秒数，只用于测试，误设会大幅拖慢启动。',
];

export const REGION_INTROS: Record<string, ReactNode> = {
  INCLUDES: (
    <>
      <Annotate title="INCLUDE 示例" code={INCLUDES_CODE} notes={INCLUDES_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          include 不会被 CONFIG REWRITE 重写。官方建议把 include 放在文件开头，避免覆盖运行时改过的值；若就是想用
          include 覆盖配置，则放在最后一行。
        </p>
      </Callout>
    </>
  ),
  MODULES: (
    <>
      <Annotate title="LOADMODULE 示例" code={MODULES_CODE} notes={MODULES_NOTES} />
      <Callout type="warning" title="注意">
        <p>模块自带的配置指令不在官方字典里，本向导无法生成；加载模块后请在体检页编辑器中手写这些指令。</p>
      </Callout>
    </>
  ),
  NETWORK: (
    <>
      <Annotate title="NETWORK 示例" code={NETWORK_CODE} notes={NETWORK_NOTES} />
      <Callout type="warning" title="注意">
        <p>把 bind 改成监听所有网卡时，必须设置密码或保持 protected-mode 开启，否则实例会暴露给整个互联网。</p>
      </Callout>
    </>
  ),
  'TLS/SSL': (
    <>
      <Annotate title="TLS 示例" code={TLS_CODE} notes={TLS_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          Redis 不使用系统信任库：必须显式配置 tls-ca-cert-file 或 tls-ca-cert-dir，否则校验客户端与对端证书没有依据。
        </p>
      </Callout>
    </>
  ),
  GENERAL: (
    <>
      <Annotate title="GENERAL 示例" code={GENERAL_CODE} notes={GENERAL_NOTES} />
      <Callout type="warning" title="注意">
        <p>日志可能含键名与命令参数；合规要求脱敏时开启 hide-user-data-from-log。</p>
      </Callout>
    </>
  ),
  SNAPSHOTTING: (
    <>
      <Annotate title="RDB 示例" code={SNAPSHOTTING_CODE} notes={SNAPSHOTTING_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          BGSAVE 失败（磁盘满、无权限）时默认拒绝写入；可容忍快照丢失才把 stop-writes-on-bgsave-error 设为
          no，不要静默掩盖磁盘故障。
        </p>
      </Callout>
    </>
  ),
  REPLICATION: (
    <>
      <Annotate title="复制示例" code={REPLICATION_CODE} notes={REPLICATION_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          复制链路断开后副本默认继续服务旧数据（replica-serve-stale-data yes）；业务不能容忍脏读时设为
          no，此时多数命令返回错误。
        </p>
      </Callout>
    </>
  ),
  'KEYS TRACKING': (
    <>
      <Annotate title="客户端缓存示例" code={TRACKING_CODE} notes={TRACKING_NOTES} />
      <Callout type="note" title="提示">
        <p>
          失效消息经 RESP3 push 或 RESP2 的 Pub/Sub 重定向通道下发；客户端必须消费失效消息，否则缓存一致性无法保证。
        </p>
      </Callout>
    </>
  ),
  SECURITY: (
    <>
      <Annotate title="SECURITY 示例" code={SECURITY_CODE} notes={SECURITY_NOTES} />
      <Callout type="warning" title="注意">
        <p>ACL 用户行含密码，整行不落盘、刷新后需重填；带回编辑器时密码会先替换为占位符。</p>
      </Callout>
    </>
  ),
  CLIENTS: (
    <>
      <Annotate title="CLIENTS 示例" code={CLIENTS_CODE} notes={CLIENTS_NOTES} />
      <Callout type="warning" title="注意">
        <p>maxclients 受进程文件描述符上限约束：ulimit -n 不足时 Redis 启动会下调有效上限并记录警告。</p>
      </Callout>
    </>
  ),
  'MEMORY MANAGEMENT': (
    <>
      <Annotate title="内存示例" code={MEMORY_CODE} notes={MEMORY_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          noeviction 在达到 maxmemory 后以 OOM 错误拒绝写入；缓存场景选 allkeys-lru / volatile-lru
          等策略，存储场景留足余量。
        </p>
      </Callout>
    </>
  ),
  'LAZY FREEING': (
    <>
      <Annotate title="异步释放示例" code={LAZYFREE_CODE} notes={LAZYFREE_NOTES} />
      <Callout type="note" title="提示">
        <p>
          lazyfree 系列开关决定淘汰、过期与隐式删除（如 SET 覆盖旧值）是否走异步释放；开启可避免大键造成主线程延迟尖峰。
        </p>
      </Callout>
    </>
  ),
  'THREADED I/O': (
    <>
      <Annotate title="IO 线程示例" code={IO_CODE} notes={IO_NOTES} />
      <Callout type="note" title="提示">
        <p>多线程 IO 只并行 socket 读写与协议解析，命令执行仍在主线程串行，CPU 密集型命令不会因此变快。</p>
      </Callout>
    </>
  ),
  'KERNEL OOM CONTROL': (
    <>
      <Annotate title="OOM 示例" code={OOM_CODE} notes={OOM_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          oom-score-adj-values 依次为主、副本、后台子进程取值（-2000 到 2000，越大越易被杀）；默认 0 200 800
          让子进程先被牺牲以保护主进程。
        </p>
      </Callout>
    </>
  ),
  'KERNEL transparent hugepage CONTROL': (
    <>
      <Annotate title="THP 示例" code={THP_CODE} notes={THP_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          透明大页会在 fork 写时复制时放大内存与延迟尖峰；官方建议 never。无权限改系统层时设 disable-thp no 并在 OS
          侧手动关闭。
        </p>
      </Callout>
    </>
  ),
  'APPEND ONLY MODE': (
    <>
      <Annotate title="AOF 示例" code={AOF_CODE} notes={AOF_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          no-appendfsync-on-rewrite 为 yes 时重写期间暂停 fsync 以避免磁盘争用，代价是最多丢重写时长内的数据；默认 no
          优先持久性。
        </p>
      </Callout>
    </>
  ),
  SHUTDOWN: (
    <>
      <Annotate title="关闭示例" code={SHUTDOWN_CODE} notes={SHUTDOWN_NOTES} />
      <Callout type="warning" title="注意">
        <p>容器环境以 SIGTERM 为停止信号；设 nosave 且无 AOF 时重启即丢全部数据，按持久化策略慎重选择。</p>
      </Callout>
    </>
  ),
  'NON-DETERMINISTIC LONG BLOCKING COMMANDS': (
    <>
      <Annotate title="长阻塞示例" code={BLOCKING_CODE} notes={BLOCKING_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          busy-reply-threshold 限制脚本、函数与模块命令的执行毫秒数；超时后对其他客户端回复 BUSY
          但不中断执行，长任务应拆分或移到低峰。
        </p>
      </Callout>
    </>
  ),
  'REDIS CLUSTER': (
    <>
      <Annotate title="集群示例" code={CLUSTER_CODE} notes={CLUSTER_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          cluster-config-file 由节点自动维护，不要手改或纳入配置管理；cluster-node-timeout
          决定故障判定，过小会在网络抖动时误判。
        </p>
      </Callout>
    </>
  ),
  'CLUSTER DOCKER/NAT support': (
    <>
      <Annotate title="宣告示例" code={ANNOUNCE_CODE} notes={ANNOUNCE_NOTES} />
      <Callout type="warning" title="注意">
        <p>announce 系列只改变对外「报告」的地址与端口，不改变实际监听；宣告地址不可达时客户端与集群对端会连接失败。</p>
      </Callout>
    </>
  ),
  'SLOW LOG': (
    <>
      <Annotate title="慢日志示例" code={SLOWLOG_CODE} notes={SLOWLOG_NOTES} />
      <Callout type="note" title="提示">
        <p>阈值只统计命令执行时间，不含 IO 与排队等待；排查延迟要结合延迟监控与客户端侧测量。</p>
      </Callout>
    </>
  ),
  'LATENCY MONITOR': (
    <>
      <Annotate title="延迟监控示例" code={LATENCY_MON_CODE} notes={LATENCY_MON_NOTES} />
      <Callout type="note" title="提示">
        <p>只记录超阈值事件；threshold 为 0 时监控关闭、LATENCY 命令返回空；开启的采样开销可忽略。</p>
      </Callout>
    </>
  ),
  'LATENCY TRACKING': (
    <>
      <Annotate title="延迟跟踪示例" code={LATENCY_TRACK_CODE} notes={LATENCY_TRACK_NOTES} />
      <Callout type="note" title="提示">
        <p>LATENCY HISTOGRAM 导出累积分布，适合看长尾；与延迟监控的事件采样互补，两者可同时开启。</p>
      </Callout>
    </>
  ),
  'EVENT NOTIFICATION': (
    <>
      <Annotate title="键空间通知示例" code={NOTIFY_CODE} notes={NOTIFY_NOTES} />
      <Callout type="note" title="提示">
        <p>
          标志可组合：K/E 选 keyspace 或 keyevent 频道，g/$/l/s/h/z/t 选类型，x/e 为过期/淘汰，A 是类型别名（不含
          x/e）；通知走 Pub/Sub，不保证可靠投递。
        </p>
      </Callout>
    </>
  ),
  'ADVANCED CONFIG': (
    <>
      <Annotate title="调优示例" code={ADVANCED_CODE} notes={ADVANCED_NOTES} />
      <Callout type="note" title="提示">
        <p>
          本区是编码阈值、缓冲区上限与后台频率的集合，默认值按通用负载调过。先用 INFO 与 MEMORY DOCTOR
          定位问题再逐项改动。
        </p>
      </Callout>
    </>
  ),
  'ACTIVE DEFRAGMENTATION': (
    <>
      <Annotate title="碎片整理示例" code={DEFRAG_CODE} notes={DEFRAG_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          没有碎片问题就不要开启。先看 INFO memory 的
          mem_fragmentation_ratio，持续偏高再调本区参数；官方也建议不确定含义时保持默认。
        </p>
      </Callout>
    </>
  ),
  'LUA SCRIPTING': (
    <>
      <Annotate title="脚本超时示例" code={LUA_CODE} notes={LUA_NOTES} />
      <Callout type="note" title="提示">
        <p>
          6.2 只有这一个参数，7.0 起改名 busy-reply-threshold 并覆盖函数与模块超时。超时后只有 SCRIPT
          KILL（未执行写操作的脚本）与 SHUTDOWN NOSAVE 可用。
        </p>
      </Callout>
    </>
  ),
  'GOPHER SERVER': (
    <>
      <Annotate title="Gopher 示例" code={GOPHER_CODE} notes={GOPHER_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          Gopher 走无需认证的 inline 请求：对外暴露的实例必须设 requirepass，否则任何命令都可能被调用。该支持在 7.0
          起已移除，新部署不要用。
        </p>
      </Callout>
    </>
  ),
  'BACKUP / RESTORE': (
    <>
      <Annotate title="备份与恢复示例" code={BACKUP_CODE} notes={BACKUP_NOTES} />
      <Callout type="note" title="提示">
        <p>
          BACKUP START 要求目标目录为空，BACKUP SEAL 之后 BASE / INCR 与 manifest 不可变。该能力只在 8.10
          起存在，更早版本仍靠 RDB 与 AOF 文件做备份。
        </p>
      </Callout>
    </>
  ),
  MISC: (
    <>
      <Annotate title="本区指令举例" code={MISC_CODE} notes={MISC_NOTES} />
      <Callout type="warning" title="注意">
        <p>
          本区指令多为实验性或调试用途，官方模板刻意没有收录，取值以字典登记的默认值为准。不确定用途就留空——留空的指令不会写进生成的
          conf，行为与官方默认完全一致。
        </p>
      </Callout>
    </>
  ),
};
