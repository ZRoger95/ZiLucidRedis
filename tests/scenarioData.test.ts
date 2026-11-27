import { expect, test } from 'vitest';

import scenarios from '../src/data/scenarios.json';
import sentinelRules from '../src/data/sentinel-rules.json';

interface Shape {
  id: string;
  name: string;
  summary: string;
  tiers: Array<{ id: string; label: string; ramMb: number }>;
  persistence: Array<{ id: string; label: string; summary: string; help?: string }>;
  access: Array<{ id: string; label: string; summary: string }>;
  reasons: Record<string, string>;
  checklist: Array<{ title: string; command: string; why: string }>;
}

const registry = scenarios as Record<string, Shape>;
const scenario = registry['single-standalone'];

test('单机单实例场景已登记且名称说明非空', () => {
  expect(scenario).toBeDefined();
  expect(scenario.id).toBe('single-standalone');
  expect(scenario.name.length).toBeGreaterThan(0);
  expect(scenario.summary.length).toBeGreaterThan(0);
});

test('独占档位为 1C1G 到 8C16G 且内存递增', () => {
  expect(scenario.tiers.map((tier) => tier.id)).toEqual(['1c1g', '2c2g', '2c4g', '4c8g', '8c16g']);
  expect(scenario.tiers.map((tier) => tier.ramMb)).toEqual([1024, 2048, 4096, 8192, 16384]);
  for (const tier of scenario.tiers) {
    expect(tier.label.length).toBeGreaterThan(0);
  }
});

test('持久化四档齐全且每档有帮助文案', () => {
  expect(scenario.persistence.map((option) => option.id)).toEqual(['off', 'rdb', 'aof', 'mixed']);
  for (const option of scenario.persistence) {
    expect(option.label.length).toBeGreaterThan(0);
    expect(option.summary.length).toBeGreaterThan(0);
    expect((option.help ?? '').length).toBeGreaterThan(0);
  }
});

test('访问面三档齐全', () => {
  expect(scenario.access.map((option) => option.id)).toEqual(['local', 'intranet', 'public']);
  for (const option of scenario.access) {
    expect(option.label.length).toBeGreaterThan(0);
    expect(option.summary.length).toBeGreaterThan(0);
  }
});

test('核心指令集每条都有中文理由', () => {
  const core = [
    'supervised',
    'logfile',
    'dir',
    'protected-mode',
    'bind',
    'maxmemory',
    'maxmemory-policy',
    'appendonly',
    'save',
    'appendfsync',
    'requirepass',
  ];
  const missing = core.filter((name) => (scenario.reasons[name] ?? '').length === 0);
  expect(missing).toEqual([]);
});

test('系统层清单至少五项且命令与原因齐全', () => {
  expect(scenario.checklist.length).toBeGreaterThanOrEqual(5);
  for (const item of scenario.checklist) {
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.command.length).toBeGreaterThan(0);
    expect(item.why.length).toBeGreaterThan(0);
  }
});

test('一主二从三哨兵场景已登记且访问面仅内网 / 公网', () => {
  const repl = registry['replica-sentinel'];
  expect(repl).toBeDefined();
  expect(repl.id).toBe('replica-sentinel');
  expect(repl.name.length).toBeGreaterThan(0);
  expect(repl.summary.length).toBeGreaterThan(0);
  expect(repl.access.map((option) => option.id)).toEqual(['intranet', 'public']);
  expect(repl.persistence.map((option) => option.id)).toEqual(['off', 'rdb', 'aof', 'mixed']);
  expect(repl.checklist.length).toBeGreaterThanOrEqual(5);
  for (const item of repl.checklist) {
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.command.length).toBeGreaterThan(0);
    expect(item.why.length).toBeGreaterThan(0);
  }
});

test('三主三从集群场景已登记且访问面仅内网 / 公网', () => {
  const cluster = registry.cluster;
  expect(cluster).toBeDefined();
  expect(cluster.id).toBe('cluster');
  expect(cluster.name.length).toBeGreaterThan(0);
  expect(cluster.summary.length).toBeGreaterThan(0);
  expect(cluster.tiers).toHaveLength(5);
  expect(cluster.access.map((option) => option.id)).toEqual(['intranet', 'public']);
  expect(cluster.persistence.map((option) => option.id)).toEqual(['off', 'rdb', 'aof', 'mixed']);
  expect(cluster.checklist.length).toBeGreaterThanOrEqual(5);
  for (const item of cluster.checklist) {
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.command.length).toBeGreaterThan(0);
    expect(item.why.length).toBeGreaterThan(0);
  }
});

test('集群登记表含集群相关理由与端口 / 跨机两条清单', () => {
  const cluster = registry.cluster;
  for (const name of [
    'cluster-enabled',
    'cluster-require-full-coverage',
    'cluster-config-file',
    'requirepass',
    'masterauth',
  ]) {
    expect((cluster.reasons[name] ?? '').length).toBeGreaterThan(0);
  }
  const titles = cluster.checklist.map((item) => item.title);
  expect(titles.some((title) => title.includes('端口'))).toBe(true);
  expect(titles.some((title) => title.includes('跨机'))).toBe(true);
});

test('哨兵登记表规则齐全且仅 auth-pass 敏感', () => {
  expect(sentinelRules.masterName).toBe('mymaster');
  expect(sentinelRules.quorum).toBe(2);
  expect(sentinelRules.defaults).toEqual({
    downAfterMs: 30000,
    failoverTimeoutMs: 180000,
    parallelSyncs: 1,
  });
  expect(sentinelRules.rules.map((rule) => rule.id)).toEqual([
    'monitor',
    'auth-pass',
    'down-after-milliseconds',
    'failover-timeout',
    'parallel-syncs',
  ]);
  for (const rule of sentinelRules.rules) {
    expect(rule.note.length).toBeGreaterThan(0);
  }
  expect(sentinelRules.rules.find((rule) => rule.id === 'auth-pass')?.sensitive).toBe(true);
  expect(sentinelRules.rules.filter((rule) => rule.sensitive)).toHaveLength(1);
});
