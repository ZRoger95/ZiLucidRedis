import fc from 'fast-check';
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import type {
  ClusterAnswers,
  ConfiguratorDraft,
  DictFile,
  ReplicaSentinelAnswers,
  ScenarioAnswers,
} from '../src/types';

import { emptyDraft } from '../src/lib/configurator';
import {
  applyCluster,
  applyReplication,
  applyScenario,
  clusterChecklist,
  clusterCreateCommand,
  clusterReady,
  clusterStepReady,
  emptyScenarioAnswers,
  formatBudget,
  maxmemoryFor,
  parseBudget,
  renderSentinelConfig,
  replicationReady,
  replicationStepReady,
  scenarioChecklist,
  scenarioReady,
  scenarioReview,
  scenarioStepReady,
} from '../src/lib/scenario';

const DICTS = readdirSync('src/data/dict')
  .filter((file) => file.endsWith('.json') && file !== 'meta.json')
  .map((file) => ({
    line: file.replace('.json', ''),
    dict: JSON.parse(readFileSync(`src/data/dict/${file}`, 'utf8')) as DictFile,
  }));

const dedicated = (tier: string, overrides: Partial<ScenarioAnswers> = {}): ScenarioAnswers => ({
  ...emptyScenarioAnswers(),
  profile: 'dedicated',
  tier,
  ...overrides,
});

const shared = (budgetMb: number, overrides: Partial<ScenarioAnswers> = {}): ScenarioAnswers => ({
  ...emptyScenarioAnswers(),
  profile: 'shared',
  budgetMb,
  ...overrides,
});

test('maxmemoryFor 按档位与预算的 75% 计算并格式化', () => {
  expect(maxmemoryFor(dedicated('1c1g'))).toBe('768mb');
  expect(maxmemoryFor(dedicated('2c2g'))).toBe('1536mb');
  expect(maxmemoryFor(dedicated('2c4g'))).toBe('3gb');
  expect(maxmemoryFor(dedicated('4c8g'))).toBe('6gb');
  expect(maxmemoryFor(dedicated('8c16g'))).toBe('12gb');
  expect(maxmemoryFor(shared(2048))).toBe('1536mb');
  expect(maxmemoryFor(shared(4096))).toBe('3gb');
  expect(maxmemoryFor(shared(3174))).toBe('2380mb');
  expect(maxmemoryFor(shared(1023))).toBe('767mb');
});

test('混部预算解析拒绝尾随垃圾', () => {
  expect(parseBudget('', 'MB')).toEqual({ state: 'empty' });
  expect(parseBudget('   ', 'GB')).toEqual({ state: 'empty' });
  for (const text of ['2abc', '2.5.5', '2,5', '1e3', '-1', 'abc', '0', '0.0', '2g']) {
    expect(parseBudget(text, 'MB'), text).toEqual({ state: 'invalid' });
    expect(parseBudget(text, 'GB'), text).toEqual({ state: 'invalid' });
  }
});

test('混部预算按单位换算为 MB', () => {
  expect(parseBudget('1000', 'MB')).toEqual({ state: 'ok', mb: 1000 });
  expect(parseBudget(' 2.5 ', 'GB')).toEqual({ state: 'ok', mb: 2560 });
  expect(parseBudget('3.', 'GB')).toEqual({ state: 'ok', mb: 3072 });
  expect(parseBudget('3.5', 'GB')).toEqual({ state: 'ok', mb: 3584 });
  expect(parseBudget('512.4', 'MB')).toEqual({ state: 'ok', mb: 512 });
});

test('混部预算回显 GB 时最多两位小数', () => {
  expect(formatBudget(3174, 'GB')).toBe('3.1');
  expect(formatBudget(1075, 'GB')).toBe('1.05');
  expect(formatBudget(2048, 'GB')).toBe('2');
  expect(formatBudget(2048, 'MB')).toBe('2048');
  expect(formatBudget(0, 'GB')).toBe('');
  expect(formatBudget(0, 'MB')).toBe('');
});

test('持久化四档的指令组合在全部版本一致', () => {
  const cases = [
    { persistence: 'off' as const, appendonly: 'no', save: '""', policy: 'allkeys-lru', fsync: undefined },
    {
      persistence: 'rdb' as const,
      appendonly: 'no',
      save: '3600 1 300 100 60 10000',
      policy: 'noeviction',
      fsync: undefined,
    },
    { persistence: 'aof' as const, appendonly: 'yes', save: '""', policy: 'noeviction', fsync: 'everysec' },
    {
      persistence: 'mixed' as const,
      appendonly: 'yes',
      save: '3600 1 300 100 60 10000',
      policy: 'noeviction',
      fsync: 'everysec',
    },
  ];
  for (const { line, dict } of DICTS) {
    for (const item of cases) {
      const { values } = applyScenario(dedicated('2c4g', { persistence: item.persistence }), dict);
      expect(values.appendonly, `${line} ${item.persistence}`).toBe(item.appendonly);
      expect(values.save, `${line} ${item.persistence}`).toBe(item.save);
      expect(values['maxmemory-policy'], `${line} ${item.persistence}`).toBe(item.policy);
      expect(values.appendfsync, `${line} ${item.persistence}`).toBe(item.fsync);
    }
  }
});

test('访问面三档的 bind 与密码组合', () => {
  const dict = DICTS.find((entry) => entry.line === '7.4')!.dict;
  const local = applyScenario(dedicated('2c4g', { access: 'local' }), dict).values;
  expect(local.bind).toBe('127.0.0.1 -::1');
  expect(local.requirepass).toBeUndefined();
  expect(local['protected-mode']).toBe('yes');
  expect(local.supervised).toBe('systemd');

  const intranet = applyScenario(
    dedicated('2c4g', { access: 'intranet', bindIp: '10.0.0.5', password: 's3cret' }),
    dict,
  ).values;
  expect(intranet.bind).toBe('10.0.0.5 127.0.0.1 -::1');
  expect(intranet.requirepass).toBe('s3cret');

  const publicAccess = applyScenario(dedicated('2c4g', { access: 'public', password: 's3cret' }), dict).values;
  expect(publicAccess.bind).toBe('0.0.0.0 -::*');
  expect(publicAccess.requirepass).toBe('s3cret');
});

test('全部版本产出的指令都存在于该版本字典', () => {
  for (const { line, dict } of DICTS) {
    const names = new Set(dict.directives.map((directive) => directive.name));
    const { values, reasons } = applyScenario(
      dedicated('2c4g', { persistence: 'mixed', access: 'intranet', bindIp: '10.0.0.5', password: 's3cret' }),
      dict,
    );
    for (const [name, value] of Object.entries(values)) {
      expect(names.has(name), `${line} ${name}`).toBe(true);
      expect(value.length, `${line} ${name}`).toBeGreaterThan(0);
      expect((reasons[name] ?? '').length, `${line} ${name} reason`).toBeGreaterThan(0);
    }
    expect(values.maxmemory).toBe('3gb');
    expect(reasons.maxmemory).toContain('75%');
  }
});

test('6.2 字典含 bind/save/dir/logfile 且预设可用', () => {
  const entry = DICTS.find((item) => item.line === '6.2')!;
  const names = new Set(entry.dict.directives.map((directive) => directive.name));
  for (const name of ['bind', 'save', 'dir', 'logfile']) {
    expect(names.has(name), name).toBe(true);
  }
  const { values } = applyScenario(dedicated('2c4g', { persistence: 'aof' }), entry.dict);
  expect(values.bind).toBe('127.0.0.1 -::1');
  expect(values.save).toBe('""');
  expect(values.dir).toBe('/var/lib/redis');
  expect(values.logfile).toBe('/var/log/redis/redis-server.log');
});

test('scenarioReady 校验资源与访问面必填项', () => {
  expect(scenarioReady(dedicated('2c4g'))).toBe(true);
  expect(scenarioReady({ ...emptyScenarioAnswers(), profile: 'dedicated' })).toBe(false);
  expect(scenarioReady(shared(2048))).toBe(true);
  expect(scenarioReady(shared(0))).toBe(false);
  expect(scenarioReady(shared(-1))).toBe(false);
  expect(scenarioReady({ ...emptyScenarioAnswers(), profile: 'shared' })).toBe(false);
  expect(scenarioReady(dedicated('2c4g', { access: 'intranet', bindIp: '10.0.0.5', password: 's3cret' }))).toBe(true);
  expect(scenarioReady(dedicated('2c4g', { access: 'intranet', password: 's3cret' }))).toBe(false);
  expect(scenarioReady(dedicated('2c4g', { access: 'intranet', bindIp: '10.0.0.5' }))).toBe(false);
  expect(scenarioReady(dedicated('2c4g', { access: 'public', password: 's3cret' }))).toBe(true);
  expect(scenarioReady(dedicated('2c4g', { access: 'public' }))).toBe(false);
});

test('scenarioStepReady 按问卷步校验', () => {
  expect(scenarioStepReady('__scenario_profile__', emptyScenarioAnswers())).toBe(true);
  expect(scenarioStepReady('__scenario_resource__', dedicated('2c4g'))).toBe(true);
  expect(scenarioStepReady('__scenario_resource__', { ...emptyScenarioAnswers(), profile: 'dedicated' })).toBe(false);
  expect(scenarioStepReady('__scenario_resource__', shared(2048))).toBe(true);
  expect(scenarioStepReady('__scenario_resource__', shared(0))).toBe(false);
  expect(scenarioStepReady('__scenario_persistence__', emptyScenarioAnswers())).toBe(true);
  expect(scenarioStepReady('__scenario_access__', emptyScenarioAnswers())).toBe(true);
  expect(scenarioStepReady('__scenario_access__', dedicated('2c4g', { access: 'public' }))).toBe(false);
});

test('任意合法答案与版本组合产出有效指令', () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const answersArb = fc.record({
    profile: fc.constantFrom('dedicated' as const, 'shared' as const),
    tier: fc.constantFrom('1c1g', '2c2g', '2c4g', '4c8g', '8c16g'),
    budgetMb: fc.integer({ max: 65536, min: 256 }),
    persistence: fc.constantFrom('off' as const, 'rdb' as const, 'aof' as const, 'mixed' as const),
    access: fc.constantFrom('local' as const, 'intranet' as const, 'public' as const),
    bindIp: fc.constant('10.0.0.5'),
    password: fc.array(fc.constantFrom(...chars), { maxLength: 16, minLength: 8 }).map((letters) => letters.join('')),
  });
  fc.assert(
    fc.property(answersArb, fc.integer({ max: DICTS.length - 1, min: 0 }), (answers, index) => {
      const { dict } = DICTS[index];
      const names = new Set(dict.directives.map((directive) => directive.name));
      const { values } = applyScenario(answers, dict);
      for (const [name, value] of Object.entries(values)) {
        expect(names.has(name)).toBe(true);
        expect(value.trim().length).toBeGreaterThan(0);
      }
      expect(values.maxmemory).toMatch(/^\d+(mb|gb)$/);
    }),
    { numRuns: 200 },
  );
});

test('scenarioReview 标记 applied/modified/reset 并按区域顺序分组', () => {
  const { dict } = DICTS.find((entry) => entry.line === '7.4')!;
  const answers = dedicated('2c4g', { persistence: 'mixed' });
  const { values } = applyScenario(answers, dict);
  const draft: ConfiguratorDraft = {
    ...emptyDraft('7.4'),
    values: { ...values, maxmemory: '4gb' },
    scenario: { id: 'single-standalone', answers, applied: values },
  };
  delete draft.values.appendfsync;

  const groups = scenarioReview(draft, dict);
  const items = groups.flatMap((group) => group.items);
  const byName = new Map(items.map((item) => [item.name, item]));
  expect(byName.get('maxmemory')?.state).toBe('modified');
  expect(byName.get('appendfsync')?.state).toBe('reset');
  expect(byName.get('appendfsync')?.value).toBeNull();
  expect(byName.get('appendonly')?.state).toBe('applied');

  const sectionOrder = dict.sections.map((section) => section.id);
  const groupOrder = groups.map((group) => group.sectionId);
  const indexes = groupOrder.map((id) => sectionOrder.indexOf(id));
  expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
  expect(groups.every((group) => group.items.length > 0)).toBe(true);
});

const repl = (overrides: Partial<ReplicaSentinelAnswers> = {}): ReplicaSentinelAnswers => ({
  profile: 'dedicated',
  tier: '2c4g',
  persistence: 'mixed',
  access: 'intranet',
  masterHost: '10.0.0.5',
  password: 's3cret',
  ...overrides,
});

test('applyReplication 产出 3 个 redis 节点与 3 个哨兵节点', () => {
  const { nodes } = applyReplication(repl(), DICTS.find((entry) => entry.line === '7.4')!.dict);
  expect(nodes.map((node) => node.role)).toEqual([
    'master',
    'replica1',
    'replica2',
    'sentinel1',
    'sentinel2',
    'sentinel3',
  ]);
  expect(nodes.map((node) => node.fileName)).toEqual([
    'redis-master-6379.conf',
    'redis-replica1-6380.conf',
    'redis-replica2-6381.conf',
    'sentinel1-26379.conf',
    'sentinel2-26380.conf',
    'sentinel3-26381.conf',
  ]);
  expect(nodes.filter((node) => node.kind === 'redis')).toHaveLength(3);
  expect(nodes.filter((node) => node.kind === 'sentinel')).toHaveLength(3);
});

test('redis 公共基础值与从库角色覆盖', () => {
  const dict = DICTS.find((entry) => entry.line === '7.4')!.dict;
  const { common, nodes } = applyReplication(repl(), dict);
  expect(common['protected-mode']).toBe('yes');
  expect(common.maxmemory).toBe('3gb');
  expect(common['maxmemory-policy']).toBe('noeviction');
  expect(common.requirepass).toBe('s3cret');
  expect(common.masterauth).toBe('s3cret');

  const replica1 = nodes.find((node) => node.role === 'replica1')!;
  expect(replica1.values.replicaof).toBe('10.0.0.5 6379');
  expect(replica1.values['replica-read-only']).toBe('yes');
  expect(replica1.values.port).toBe('6380');
  const replica2 = nodes.find((node) => node.role === 'replica2')!;
  expect(replica2.values.replicaof).toBe('10.0.0.5 6379');
  expect(replica2.values.port).toBe('6381');
  const master = nodes.find((node) => node.role === 'master')!;
  expect(master.values.replicaof).toBeUndefined();
});

test('哨兵三份配置仅端口不同，规则一致；auth-pass 仅填密码时出现', () => {
  const s0 = renderSentinelConfig(repl(), 0);
  expect(s0).toContain('port 26379');
  expect(renderSentinelConfig(repl(), 1)).toContain('port 26380');
  expect(renderSentinelConfig(repl(), 2)).toContain('port 26381');
  expect(s0).toContain('protected-mode yes');
  expect(s0).toContain('supervised systemd');
  expect(s0).toContain('sentinel monitor mymaster 10.0.0.5 6379 2');
  expect(s0).toContain('sentinel down-after-milliseconds mymaster 30000');
  expect(s0).toContain('sentinel failover-timeout mymaster 180000');
  expect(s0).toContain('sentinel parallel-syncs mymaster 1');
  expect(s0).toContain('sentinel auth-pass mymaster s3cret');

  const noPassword = renderSentinelConfig(repl({ password: '' }), 0);
  expect(noPassword).not.toContain('auth-pass');
});

test('全部版本 redis 节点产出指令都在字典内', () => {
  for (const { line, dict } of DICTS) {
    const names = new Set(dict.directives.map((directive) => directive.name));
    const { common, nodes } = applyReplication(repl(), dict);
    const overrides = nodes.flatMap((node) => Object.keys(node.values));
    for (const name of [...Object.keys(common), ...overrides]) {
      expect(names.has(name), `${line} ${name}`).toBe(true);
    }
  }
});

test('replicationReady 校验主库地址、密码与资源基数', () => {
  expect(replicationReady(repl())).toBe(true);
  expect(replicationReady(repl({ masterHost: '' }))).toBe(false);
  expect(replicationReady(repl({ password: '' }))).toBe(false);
  expect(replicationReady(repl({ profile: 'shared', tier: undefined, budgetMb: 0 }))).toBe(false);
  expect(replicationStepReady('__repl_resource__', repl())).toBe(true);
  expect(replicationStepReady('__repl_persistence__', repl())).toBe(true);
  expect(replicationStepReady('__repl_network__', repl())).toBe(true);
  expect(replicationStepReady('__repl_network__', repl({ masterHost: '' }))).toBe(false);
});

test('任意合法答案与版本组合 redis 键有效且哨兵文本无空主机名', () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const answersArb = fc.record({
    profile: fc.constantFrom('dedicated' as const, 'shared' as const),
    tier: fc.constantFrom('1c1g', '2c2g', '2c4g', '4c8g', '8c16g'),
    budgetMb: fc.integer({ max: 65536, min: 256 }),
    persistence: fc.constantFrom('off' as const, 'rdb' as const, 'aof' as const, 'mixed' as const),
    access: fc.constantFrom('intranet' as const, 'public' as const),
    masterHost: fc.constant('10.0.0.5'),
    password: fc.array(fc.constantFrom(...chars), { maxLength: 16, minLength: 8 }).map((letters) => letters.join('')),
  });
  fc.assert(
    fc.property(answersArb, fc.integer({ max: DICTS.length - 1, min: 0 }), (answers, index) => {
      const { dict } = DICTS[index];
      const names = new Set(dict.directives.map((directive) => directive.name));
      const { common, nodes } = applyReplication(answers, dict);
      for (const name of [...Object.keys(common), ...nodes.flatMap((node) => Object.keys(node.values))]) {
        expect(names.has(name)).toBe(true);
      }
      expect(renderSentinelConfig(answers, 0)).not.toMatch(/monitor\s+mymaster\s+\s+/);
    }),
    { numRuns: 100 },
  );
});

const cluster = (overrides: Partial<ClusterAnswers> = {}): ClusterAnswers => ({
  access: 'intranet',
  nodeIp: '10.0.0.5',
  password: 's3cret',
  persistence: 'mixed',
  profile: 'dedicated',
  tier: '2c4g',
  ...overrides,
});

test('applyCluster 产出 6 个 redis 节点且文件名端口对应', () => {
  const dict = DICTS.find((entry) => entry.line === '7.4')!.dict;
  const { nodes } = applyCluster(cluster(), dict);
  expect(nodes.map((node) => node.role)).toEqual(['node1', 'node2', 'node3', 'node4', 'node5', 'node6']);
  expect(nodes.every((node) => node.kind === 'redis')).toBe(true);
  expect(nodes.map((node) => node.fileName)).toEqual([
    'redis-master1-7000.conf',
    'redis-master2-7001.conf',
    'redis-master3-7002.conf',
    'redis-replica1-7003.conf',
    'redis-replica2-7004.conf',
    'redis-replica3-7005.conf',
  ]);
  expect(nodes.map((node) => node.values.port)).toEqual(['7000', '7001', '7002', '7003', '7004', '7005']);
});

test('集群公共值开启集群并关闭全量覆盖要求', () => {
  const dict = DICTS.find((entry) => entry.line === '7.4')!.dict;
  const { common } = applyCluster(cluster(), dict);
  expect(common['cluster-enabled']).toBe('yes');
  expect(common['cluster-require-full-coverage']).toBe('no');
  expect(common.bind).toBe('10.0.0.5 127.0.0.1 -::1');
  expect(common.requirepass).toBe('s3cret');
  expect(common.masterauth).toBe('s3cret');
  expect(common.maxmemory).toBe('3gb');
  expect(common['maxmemory-policy']).toBe('noeviction');
  expect(common.appendonly).toBe('yes');
  expect(common.appendfsync).toBe('everysec');
});

test('节点覆盖含独立目录与集群配置文件，且不含 replicaof', () => {
  const dict = DICTS.find((entry) => entry.line === '7.4')!.dict;
  const { nodes } = applyCluster(cluster(), dict);
  const first = nodes[0];
  expect(first.values.dir).toBe('/var/lib/redis/7000');
  expect(first.values.logfile).toBe('/var/log/redis/redis-7000.log');
  expect(first.values['cluster-config-file']).toBe('nodes-7000.conf');
  const legacy = DICTS.find((entry) => entry.line === '6.2')!.dict;
  const legacyNodes = applyCluster(cluster(), legacy).nodes;
  expect(legacyNodes[0].values['cluster-config-file']).toBeUndefined();
  expect(legacyNodes[0].values.dir).toBe('/var/lib/redis/7000');
  for (const node of nodes) {
    expect(node.values.replicaof).toBeUndefined();
  }
});

test('集群持久化四档与单机场景同一张表', () => {
  const dict = DICTS.find((entry) => entry.line === '7.4')!.dict;
  for (const persistence of ['off', 'rdb', 'aof', 'mixed'] as const) {
    const clusterCommon = applyCluster(cluster({ persistence }), dict).common;
    const singleValues = applyScenario(
      { access: 'local', persistence, profile: 'dedicated', tier: '2c4g' },
      dict,
    ).values;
    for (const name of ['appendonly', 'save', 'appendfsync', 'maxmemory-policy']) {
      expect(clusterCommon[name], `${persistence} ${name}`).toBe(singleValues[name]);
    }
  }
});

test('clusterCreateCommand 含六个节点地址与从库参数', () => {
  const command = clusterCreateCommand(cluster());
  expect(command).toContain('--cluster create');
  expect(command).toContain('10.0.0.5:7000');
  expect(command).toContain('10.0.0.5:7005');
  expect(command).toContain('--cluster-replicas 1');
  expect(command).toContain("-a 's3cret'");
});

test('clusterChecklist 在登记表清单前插入初始化命令', () => {
  const checklist = clusterChecklist(cluster());
  expect(checklist).toHaveLength(scenarioChecklist('cluster').length + 1);
  expect(checklist[0].command).toContain('--cluster create');
  expect(checklist[0].title).toContain('初始化集群');
});

test('clusterReady 与 clusterStepReady 校验节点地址、密码与资源', () => {
  expect(clusterReady(cluster())).toBe(true);
  expect(clusterReady(cluster({ nodeIp: '' }))).toBe(false);
  expect(clusterReady(cluster({ password: '' }))).toBe(false);
  expect(clusterReady(cluster({ profile: 'shared', tier: undefined, budgetMb: 0 }))).toBe(false);
  expect(clusterStepReady('__cluster_resource__', cluster())).toBe(true);
  expect(clusterStepReady('__cluster_persistence__', cluster())).toBe(true);
  expect(clusterStepReady('__cluster_network__', cluster())).toBe(true);
  expect(clusterStepReady('__cluster_network__', cluster({ nodeIp: '' }))).toBe(false);
});

test('全部版本集群节点指令都在字典内', () => {
  for (const { line, dict } of DICTS) {
    const names = new Set(dict.directives.map((directive) => directive.name));
    const { common, nodes } = applyCluster(cluster(), dict);
    for (const name of [...Object.keys(common), ...nodes.flatMap((node) => Object.keys(node.values))]) {
      expect(names.has(name), `${line} ${name}`).toBe(true);
    }
  }
});

test('集群公网档绑定全部地址，内网档只绑节点地址', () => {
  const dict = DICTS.find((entry) => entry.line === '7.4')!.dict;
  expect(applyCluster(cluster({ access: 'public' }), dict).common.bind).toBe('0.0.0.0 -::*');
  expect(applyCluster(cluster(), dict).common.bind).toBe('10.0.0.5 127.0.0.1 -::1');
});

test('任意集群答案与版本组合指令有效且地址非空', () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const answersArb = fc.record({
    profile: fc.constantFrom('dedicated' as const, 'shared' as const),
    tier: fc.constantFrom('1c1g', '2c2g', '2c4g', '4c8g', '8c16g'),
    budgetMb: fc.integer({ max: 65536, min: 256 }),
    persistence: fc.constantFrom('off' as const, 'rdb' as const, 'aof' as const, 'mixed' as const),
    access: fc.constantFrom('intranet' as const, 'public' as const),
    nodeIp: fc.constant('10.0.0.5'),
    password: fc.array(fc.constantFrom(...chars), { maxLength: 16, minLength: 8 }).map((letters) => letters.join('')),
  });
  fc.assert(
    fc.property(answersArb, fc.integer({ max: DICTS.length - 1, min: 0 }), (answers, index) => {
      const { dict } = DICTS[index];
      const names = new Set(dict.directives.map((directive) => directive.name));
      const { common, nodes } = applyCluster(answers, dict);
      for (const name of [...Object.keys(common), ...nodes.flatMap((node) => Object.keys(node.values))]) {
        expect(names.has(name)).toBe(true);
      }
      expect(common.bind).toBe(answers.access === 'public' ? '0.0.0.0 -::*' : '10.0.0.5 127.0.0.1 -::1');
      expect(clusterCreateCommand(answers)).not.toMatch(/:\s|create\s+:\d/);
    }),
    { numRuns: 100 },
  );
});
