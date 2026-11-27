import type {
  BudgetParse,
  ClusterAnswers,
  ConfiguratorDraft,
  DictFile,
  ReplicaSentinelAnswers,
  ScenarioAnswers,
  ScenarioChecklistItem,
  ScenarioId,
  ScenarioNodeFile,
  ScenarioProfile,
  ScenarioRegistry,
  ScenarioReviewGroup,
  ScenarioReviewItem,
} from '../types';

import scenarios from '../data/scenarios.json';
import sentinelRules from '../data/sentinel-rules.json';

export const SCENARIO_ID = 'single-standalone';

const REGISTRIES = scenarios as Record<ScenarioId, ScenarioRegistry>;
const registry = REGISTRIES[SCENARIO_ID];

export const SCENARIO_CHECKLIST = registry.checklist;

export function scenarioChecklist(id: ScenarioId): ScenarioChecklistItem[] {
  return REGISTRIES[id].checklist;
}

const DEFAULT_SAVE = '3600 1 300 100 60 10000';
const DATA_DIR = '/var/lib/redis';
const LOG_FILE = '/var/log/redis/redis-server.log';

export function emptyScenarioAnswers(): ScenarioAnswers {
  return { access: 'local', persistence: 'off', profile: 'dedicated' };
}

function formatMemory(mb: number): string {
  return mb % 1024 === 0 ? `${mb / 1024}gb` : `${mb}mb`;
}

const BUDGET_PATTERN = /^\d+(?:\.\d*)?$/;

export function parseBudget(text: string, unit: 'GB' | 'MB'): BudgetParse {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { state: 'empty' };
  }
  if (!BUDGET_PATTERN.test(trimmed)) {
    return { state: 'invalid' };
  }
  const parsed = Number(trimmed);
  const mb = Math.round(unit === 'GB' ? parsed * 1024 : parsed);
  if (!Number.isFinite(mb) || mb <= 0) {
    return { state: 'invalid' };
  }
  return { mb, state: 'ok' };
}

export function formatBudget(mb: number, unit: 'GB' | 'MB'): string {
  if (!Number.isFinite(mb) || mb <= 0) {
    return '';
  }
  if (unit === 'MB') {
    return String(Math.round(mb));
  }
  return String(Math.round((mb / 1024) * 100) / 100);
}

function memoryBase(profile: ScenarioProfile, tierId: string | undefined, budgetMb: number | undefined): number {
  if (profile === 'shared') {
    return typeof budgetMb === 'number' && Number.isFinite(budgetMb) ? budgetMb : 0;
  }
  return registry.tiers.find((tier) => tier.id === tierId)?.ramMb ?? 0;
}

function memoryBaseMb(answers: ScenarioAnswers): number {
  return memoryBase(answers.profile, answers.tier, answers.budgetMb);
}

export function maxmemoryFor(answers: ScenarioAnswers): string {
  return formatMemory(Math.floor((memoryBaseMb(answers) * 3) / 4));
}

function resourceReady(answers: ScenarioAnswers): boolean {
  return memoryBaseMb(answers) > 0;
}

function accessReady(answers: ScenarioAnswers): boolean {
  if (answers.access === 'local') {
    return true;
  }
  const hasPassword = (answers.password ?? '').trim() !== '';
  if (answers.access === 'public') {
    return hasPassword;
  }
  return (answers.bindIp ?? '').trim() !== '' && hasPassword;
}

export function scenarioReady(answers: ScenarioAnswers): boolean {
  return resourceReady(answers) && accessReady(answers);
}

export function scenarioStepReady(stepId: string, answers: ScenarioAnswers): boolean {
  if (stepId === '__scenario_resource__') {
    return resourceReady(answers);
  }
  if (stepId === '__scenario_access__') {
    return accessReady(answers);
  }
  return stepId === '__scenario_profile__' || stepId === '__scenario_persistence__';
}

function bindFor(answers: ScenarioAnswers): string {
  if (answers.access === 'public') {
    return '0.0.0.0 -::*';
  }
  if (answers.access === 'intranet') {
    return `${(answers.bindIp ?? '').trim()} 127.0.0.1 -::1`;
  }
  return '127.0.0.1 -::1';
}

function maxmemoryReason(answers: ScenarioAnswers, value: string): string {
  const base = registry.reasons.maxmemory;
  if (answers.profile === 'shared') {
    return `${base}（预算 ${answers.budgetMb}MB × 75% = ${value}）`;
  }
  const label = registry.tiers.find((tier) => tier.id === answers.tier)?.label ?? answers.tier;
  return `${base}（${label} × 75% = ${value}）`;
}

export function applyScenario(
  answers: ScenarioAnswers,
  dict: DictFile,
): { reasons: Record<string, string>; values: Record<string, string> } {
  const known = new Set(dict.directives.map((directive) => directive.name));
  const values: Record<string, string> = {};
  const set = (name: string, value: string) => {
    if (known.has(name) && value !== '') {
      values[name] = value;
    }
  };

  set('supervised', 'systemd');
  set('logfile', LOG_FILE);
  set('dir', DATA_DIR);
  set('protected-mode', 'yes');
  set('bind', bindFor(answers));

  const baseMb = memoryBaseMb(answers);
  if (baseMb > 0) {
    set('maxmemory', formatMemory(Math.floor((baseMb * 3) / 4)));
  }
  set('maxmemory-policy', answers.persistence === 'off' ? 'allkeys-lru' : 'noeviction');
  set('appendonly', answers.persistence === 'off' || answers.persistence === 'rdb' ? 'no' : 'yes');
  set('save', answers.persistence === 'off' || answers.persistence === 'aof' ? '""' : DEFAULT_SAVE);
  if (answers.persistence === 'aof' || answers.persistence === 'mixed') {
    set('appendfsync', 'everysec');
  }
  if (answers.access !== 'local' && (answers.password ?? '').trim() !== '') {
    set('requirepass', answers.password ?? '');
  }

  const reasons: Record<string, string> = {};
  for (const name of Object.keys(values)) {
    reasons[name] = name === 'maxmemory' ? maxmemoryReason(answers, values[name]) : (registry.reasons[name] ?? '');
  }
  return { reasons, values };
}

export function scenarioReview(draft: ConfiguratorDraft, dict: DictFile): ScenarioReviewGroup[] {
  const scenario = draft.scenario;
  if (!scenario) {
    return [];
  }
  const reviewRegistry = REGISTRIES[scenario.id];
  const sectionOf = new Map(dict.directives.map((directive) => [directive.name, directive.section]));
  const grouped = new Map<string, ScenarioReviewItem[]>();
  for (const [name, appliedValue] of Object.entries(scenario.applied)) {
    const current = draft.values[name];
    let state: ScenarioReviewItem['state'] = 'modified';
    if (current === undefined) {
      state = 'reset';
    } else if (current === appliedValue) {
      state = 'applied';
    }
    const item: ScenarioReviewItem = {
      name,
      reason: reviewRegistry.reasons[name] ?? '',
      state,
      value: current === undefined ? null : current,
    };
    const sectionId = sectionOf.get(name) ?? 'MISC';
    const list = grouped.get(sectionId) ?? [];
    list.push(item);
    grouped.set(sectionId, list);
  }
  const order = [...dict.sections.map((section) => section.id), 'MISC'];
  return order
    .filter((sectionId) => grouped.has(sectionId))
    .map((sectionId) => ({ items: grouped.get(sectionId) ?? [], sectionId }));
}

export const REPLICA_SENTINEL_ID = 'replica-sentinel';

const REDIS_NODE_META = [
  { role: 'master' as const, port: 6379, fileName: 'redis-master-6379.conf', title: '主库' },
  { role: 'replica1' as const, port: 6380, fileName: 'redis-replica1-6380.conf', title: '从库 1' },
  { role: 'replica2' as const, port: 6381, fileName: 'redis-replica2-6381.conf', title: '从库 2' },
];

const SENTINEL_NODE_META = [
  { role: 'sentinel1' as const, port: 26379, fileName: 'sentinel1-26379.conf', title: '哨兵 1' },
  { role: 'sentinel2' as const, port: 26380, fileName: 'sentinel2-26380.conf', title: '哨兵 2' },
  { role: 'sentinel3' as const, port: 26381, fileName: 'sentinel3-26381.conf', title: '哨兵 3' },
];

const SENTINEL_PORTS = SENTINEL_NODE_META.map((meta) => meta.port);

export function emptyReplicationAnswers(): ReplicaSentinelAnswers {
  return { profile: 'dedicated', persistence: 'off', access: 'intranet' };
}

function bindReplicationFor(answers: ReplicaSentinelAnswers): string {
  if (answers.access === 'public') {
    return '0.0.0.0 -::*';
  }
  return `${(answers.masterHost ?? '').trim()} 127.0.0.1 -::1`;
}

function replResourceReady(answers: ReplicaSentinelAnswers): boolean {
  return memoryBase(answers.profile, answers.tier, answers.budgetMb) > 0;
}

export function replicationReady(answers: ReplicaSentinelAnswers): boolean {
  return (
    replResourceReady(answers) && (answers.masterHost ?? '').trim() !== '' && (answers.password ?? '').trim() !== ''
  );
}

export function replicationStepReady(stepId: string, answers: ReplicaSentinelAnswers): boolean {
  if (stepId === '__repl_resource__') {
    return replResourceReady(answers);
  }
  if (stepId === '__repl_network__') {
    return (answers.masterHost ?? '').trim() !== '' && (answers.password ?? '').trim() !== '';
  }
  return stepId === '__repl_persistence__';
}

export function applyReplication(
  answers: ReplicaSentinelAnswers,
  dict: DictFile,
): { common: Record<string, string>; nodes: ScenarioNodeFile[]; reasons: Record<string, string> } {
  const known = new Set(dict.directives.map((directive) => directive.name));
  const common: Record<string, string> = {};
  const setCommon = (name: string, value: string) => {
    if (known.has(name) && value !== '') {
      common[name] = value;
    }
  };

  setCommon('supervised', 'systemd');
  setCommon('protected-mode', 'yes');
  const baseMb = memoryBase(answers.profile, answers.tier, answers.budgetMb);
  if (baseMb > 0) {
    setCommon('maxmemory', formatMemory(Math.floor((baseMb * 3) / 4)));
  }
  setCommon('maxmemory-policy', answers.persistence === 'off' ? 'allkeys-lru' : 'noeviction');
  setCommon('appendonly', answers.persistence === 'off' || answers.persistence === 'rdb' ? 'no' : 'yes');
  setCommon('save', answers.persistence === 'off' || answers.persistence === 'aof' ? '""' : DEFAULT_SAVE);
  if (answers.persistence === 'aof' || answers.persistence === 'mixed') {
    setCommon('appendfsync', 'everysec');
  }
  const password = (answers.password ?? '').trim();
  if (password !== '') {
    setCommon('requirepass', password);
    setCommon('masterauth', password);
  }
  setCommon('bind', bindReplicationFor(answers));

  const filterOverlay = (values: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(values).filter(([name, value]) => known.has(name) && value !== ''));

  const nodes: ScenarioNodeFile[] = [
    {
      role: 'master',
      kind: 'redis',
      fileName: REDIS_NODE_META[0].fileName,
      title: REDIS_NODE_META[0].title,
      values: filterOverlay({ port: '6379', dir: DATA_DIR, logfile: '/var/log/redis/redis-master.log' }),
    },
    ...(['replica1', 'replica2'] as const).map((role, index) => {
      const meta = REDIS_NODE_META[index + 1];
      return {
        role,
        kind: 'redis' as const,
        fileName: meta.fileName,
        title: meta.title,
        values: filterOverlay({
          port: String(meta.port),
          dir: DATA_DIR,
          logfile: `/var/log/redis/redis-${role}.log`,
          replicaof: `${(answers.masterHost ?? '').trim()} 6379`,
          'replica-read-only': 'yes',
        }),
      };
    }),
    ...SENTINEL_NODE_META.map((meta) => ({
      role: meta.role,
      kind: 'sentinel' as const,
      fileName: meta.fileName,
      title: meta.title,
      values: {},
    })),
  ];

  const reasons: Record<string, string> = {};
  for (const name of Object.keys(common)) {
    reasons[name] = REGISTRIES[REPLICA_SENTINEL_ID].reasons[name] ?? '';
  }
  return { common, nodes, reasons };
}

export function renderSentinelConfig(answers: ReplicaSentinelAnswers, sentinelIndex: number): string {
  const masterHost = (answers.masterHost ?? '').trim();
  const password = (answers.password ?? '').trim();
  const lines = [
    `port ${SENTINEL_PORTS[sentinelIndex]}`,
    'bind 127.0.0.1 -::1',
    'protected-mode yes',
    'dir /var/lib/redis/sentinel',
    'supervised systemd',
    `logfile /var/log/redis/sentinel${sentinelIndex + 1}.log`,
    `sentinel monitor ${sentinelRules.masterName} ${masterHost} 6379 ${sentinelRules.quorum}`,
  ];
  if (password !== '') {
    lines.push(`sentinel auth-pass ${sentinelRules.masterName} ${password}`);
  }
  lines.push(`sentinel down-after-milliseconds ${sentinelRules.masterName} ${sentinelRules.defaults.downAfterMs}`);
  lines.push(`sentinel failover-timeout ${sentinelRules.masterName} ${sentinelRules.defaults.failoverTimeoutMs}`);
  lines.push(`sentinel parallel-syncs ${sentinelRules.masterName} ${sentinelRules.defaults.parallelSyncs}`);
  return `${lines.join('\n')}\n`;
}

export const CLUSTER_ID = 'cluster';

const CLUSTER_NODE_META = [
  { role: 'node1' as const, port: 7000, fileName: 'redis-master1-7000.conf', title: '主库 1' },
  { role: 'node2' as const, port: 7001, fileName: 'redis-master2-7001.conf', title: '主库 2' },
  { role: 'node3' as const, port: 7002, fileName: 'redis-master3-7002.conf', title: '主库 3' },
  { role: 'node4' as const, port: 7003, fileName: 'redis-replica1-7003.conf', title: '从库 1' },
  { role: 'node5' as const, port: 7004, fileName: 'redis-replica2-7004.conf', title: '从库 2' },
  { role: 'node6' as const, port: 7005, fileName: 'redis-replica3-7005.conf', title: '从库 3' },
];

const CLUSTER_NODE_ADDRESSES = CLUSTER_NODE_META.map((meta) => meta.port);

export function emptyClusterAnswers(): ClusterAnswers {
  return { access: 'intranet', persistence: 'off', profile: 'dedicated' };
}

function bindClusterFor(answers: ClusterAnswers): string {
  if (answers.access === 'public') {
    return '0.0.0.0 -::*';
  }
  return `${(answers.nodeIp ?? '').trim()} 127.0.0.1 -::1`;
}

function clusterResourceReady(answers: ClusterAnswers): boolean {
  return memoryBase(answers.profile, answers.tier, answers.budgetMb) > 0;
}

function clusterNetworkReady(answers: ClusterAnswers): boolean {
  return (answers.nodeIp ?? '').trim() !== '' && (answers.password ?? '').trim() !== '';
}

export function clusterReady(answers: ClusterAnswers): boolean {
  return clusterResourceReady(answers) && clusterNetworkReady(answers);
}

export function clusterStepReady(stepId: string, answers: ClusterAnswers): boolean {
  if (stepId === '__cluster_resource__') {
    return clusterResourceReady(answers);
  }
  if (stepId === '__cluster_network__') {
    return clusterNetworkReady(answers);
  }
  return stepId === '__cluster_persistence__';
}

export function applyCluster(
  answers: ClusterAnswers,
  dict: DictFile,
): { common: Record<string, string>; nodes: ScenarioNodeFile[]; reasons: Record<string, string> } {
  const known = new Set(dict.directives.map((directive) => directive.name));
  const common: Record<string, string> = {};
  const setCommon = (name: string, value: string) => {
    if (known.has(name) && value !== '') {
      common[name] = value;
    }
  };

  setCommon('cluster-enabled', 'yes');
  setCommon('cluster-require-full-coverage', 'no');
  setCommon('supervised', 'systemd');
  setCommon('protected-mode', 'yes');
  setCommon('bind', bindClusterFor(answers));
  const baseMb = memoryBase(answers.profile, answers.tier, answers.budgetMb);
  if (baseMb > 0) {
    setCommon('maxmemory', formatMemory(Math.floor((baseMb * 3) / 4)));
  }
  setCommon('maxmemory-policy', answers.persistence === 'off' ? 'allkeys-lru' : 'noeviction');
  setCommon('appendonly', answers.persistence === 'off' || answers.persistence === 'rdb' ? 'no' : 'yes');
  setCommon('save', answers.persistence === 'off' || answers.persistence === 'aof' ? '""' : DEFAULT_SAVE);
  if (answers.persistence === 'aof' || answers.persistence === 'mixed') {
    setCommon('appendfsync', 'everysec');
  }
  const password = (answers.password ?? '').trim();
  if (password !== '') {
    setCommon('requirepass', password);
    setCommon('masterauth', password);
  }

  const filterOverlay = (values: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(values).filter(([name, value]) => known.has(name) && value !== ''));

  const nodes: ScenarioNodeFile[] = CLUSTER_NODE_META.map((meta) => ({
    role: meta.role,
    kind: 'redis' as const,
    fileName: meta.fileName,
    title: meta.title,
    values: filterOverlay({
      port: String(meta.port),
      dir: `/var/lib/redis/${meta.port}`,
      logfile: `/var/log/redis/redis-${meta.port}.log`,
      'cluster-config-file': `nodes-${meta.port}.conf`,
    }),
  }));

  const reasons: Record<string, string> = {};
  for (const name of Object.keys(common)) {
    reasons[name] = REGISTRIES[CLUSTER_ID].reasons[name] ?? '';
  }
  return { common, nodes, reasons };
}

export function clusterCreateCommand(answers: ClusterAnswers): string {
  const host = (answers.nodeIp ?? '').trim();
  const password = (answers.password ?? '').trim();
  const auth = password === '' ? '' : ` -a '${password}'`;
  const addresses = CLUSTER_NODE_ADDRESSES.map((port) => `${host}:${port}`).join(' ');
  return `redis-cli${auth} --cluster create ${addresses} --cluster-replicas 1`;
}

export function clusterChecklist(answers: ClusterAnswers): ScenarioChecklistItem[] {
  return [
    {
      command: clusterCreateCommand(answers),
      title: '初始化集群：分配槽并建立主从',
      why: '节点启动时还没有任何槽；这条命令把 16384 个槽均分给前 3 个节点，并让后 3 个节点各成为其中一个的从库。执行一次即可，重复执行会报节点已加入集群',
    },
    ...REGISTRIES[CLUSTER_ID].checklist,
  ];
}
