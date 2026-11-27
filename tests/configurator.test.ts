import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import type { ClusterAnswers, ConfiguratorDraft, DictFile } from '../src/types';

import { buildSteps, changeCount, emptyDraft, renderConfig, sectionComment } from '../src/lib/configurator';
import { applyCluster, emptyClusterAnswers } from '../src/lib/scenario';

const VERSIONS = readdirSync('src/data/dict')
  .filter((file) => file.endsWith('.json') && file !== 'meta.json')
  .map((file) => file.replace(/\.json$/, ''));

function load(version: string): { dict: DictFile; official: string } {
  return {
    dict: JSON.parse(readFileSync(`src/data/dict/${version}.json`, 'utf8')) as DictFile,
    official: readFileSync(`src/data/official/${version}.conf`, 'utf8'),
  };
}

const normalize = (text: string): string => `${text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')}\n`;

function lineStartingWith(text: string, name: string): number[] {
  return text
    .split('\n')
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.replace(/^#+\s*/, '').startsWith(`${name} `) || line.replace(/^#+\s*/, '') === name)
    .map(({ index }) => index);
}

function activeLines(text: string, name: string): string[] {
  return text.split('\n').filter((line) => line.trim().startsWith(name));
}

test.each(VERSIONS)('%s 的每个指令恰好进入一个步骤', (version) => {
  const { dict } = load(version);
  const steps = buildSteps(dict);
  const seen = new Map<string, number>();

  for (const step of steps) {
    for (const directive of step.directives) {
      seen.set(directive.name, (seen.get(directive.name) ?? 0) + 1);
    }
  }

  expect(seen.size).toBe(dict.directives.length);
  for (const [name, count] of seen) {
    expect(count, name).toBe(1);
  }
});

test('步骤顺序与自由行归属', () => {
  const { dict } = load('7.4');
  const steps = buildSteps(dict);

  expect(steps[0].kind).toBe('version');
  expect(steps.at(-1)?.kind).toBe('finish');
  expect(steps.filter((step) => step.kind === 'section').map((step) => step.id)).toEqual(
    dict.sections.map((section) => section.id),
  );

  const misc = steps.find((step) => step.kind === 'extra');
  expect(misc?.id).toBe('MISC');
  expect(steps.at(-2)?.id).toBe('MISC');

  const includes = steps.find((step) => step.id === 'INCLUDES');
  expect(includes?.freeLines).toEqual(['include']);
  expect(steps.find((step) => step.id === 'SECURITY')?.freeLines).toEqual(['user', 'renameCommand']);
});

test.each(VERSIONS)('%s 未改动时输出与官方 conf 一致', (version) => {
  const { dict, official } = load(version);

  expect(renderConfig(official, dict, emptyDraft(version))).toBe(normalize(official));
});

test('改动单个指令只影响该行', () => {
  const { dict, official } = load('7.4');
  const draft: ConfiguratorDraft = { ...emptyDraft('7.4'), values: { port: '6380' } };
  const output = renderConfig(official, dict, draft);

  expect(output).toContain('\nport 6380\n');
  expect(output).not.toContain('\nport 6379\n');
  expect(output.split('\n').length).toBe(normalize(official).split('\n').length);
});

test('多行值展开成多条同指令行', () => {
  const { dict, official } = load('7.4');
  const draft: ConfiguratorDraft = { ...emptyDraft('7.4'), values: { save: '900 1\n300 10' } };
  const output = renderConfig(official, dict, draft);

  expect(activeLines(output, 'save')).toEqual(['save 900 1', 'save 300 10']);
});

test('同一指令的其它生效行被注释，避免重复配置', () => {
  const { dict, official } = load('7.4');
  const draft: ConfiguratorDraft = {
    ...emptyDraft('7.4'),
    values: { 'client-output-buffer-limit': 'replica 128mb 32mb 30' },
  };
  const output = renderConfig(official, dict, draft);

  expect(activeLines(output, 'client-output-buffer-limit')).toEqual([
    'client-output-buffer-limit replica 128mb 32mb 30',
  ]);
  expect(output).toContain('# client-output-buffer-limit replica 256mb 64mb 60');
  expect(output).toContain('# client-output-buffer-limit pubsub 32mb 8mb 60');
});

test('include 落在 INCLUDES 区域末尾、MODULES 横幅之前', () => {
  const { dict, official } = load('7.4');
  const draft: ConfiguratorDraft = { ...emptyDraft('7.4'), include: ['/etc/redis/*.conf'] };
  const output = renderConfig(official, dict, draft);
  const lines = output.split('\n');

  const includeAt = lines.indexOf('include /etc/redis/*.conf');
  const includesBanner = lines.findIndex((line) => /INCLUDES/.test(line));
  const modulesBanner = lines.findIndex((line) => /MODULES/.test(line));

  expect(includeAt).toBeGreaterThan(includesBanner);
  expect(includeAt).toBeLessThan(modulesBanner);
});

test('ACL 行缺失 user 前缀时自动补齐', () => {
  const { dict, official } = load('7.4');
  const draft: ConfiguratorDraft = { ...emptyDraft('7.4'), user: ['alice on >pass ~* +@all'] };
  const output = renderConfig(official, dict, draft);

  expect(output).toContain('user alice on >pass ~* +@all');
});

test('rename-command 空新名序列化为双引号', () => {
  const { dict, official } = load('7.4');
  const draft: ConfiguratorDraft = {
    ...emptyDraft('7.4'),
    renameCommand: [{ command: 'CONFIG', target: '' }],
  };
  const output = renderConfig(official, dict, draft);

  expect(output).toContain('rename-command CONFIG ""');
});

test('MISC 指令追加到文件末尾', () => {
  const { dict, official } = load('7.4');
  const draft: ConfiguratorDraft = { ...emptyDraft('7.4'), values: { 'prefetch-batch-max-size': '32' } };
  const output = renderConfig(official, dict, draft);
  const lines = output.split('\n');

  expect(output).toContain('# 官方模板未收录的指令（来自 config.c）');
  expect(lines).toContain('prefetch-batch-max-size 32');
  expect(lines.indexOf('prefetch-batch-max-size 32')).toBeGreaterThan(
    lines.findIndex((line) => /ACTIVE DEFRAGMENTATION/.test(line)),
  );
});

test('changeCount 统计指令与自由行', () => {
  const draft: ConfiguratorDraft = {
    ...emptyDraft('7.4'),
    values: { port: '6380', save: '900 1' },
    include: ['/a.conf'],
    user: ['user alice on >secret'],
  };

  expect(changeCount(draft)).toBe(4);
});

test('sectionComment 返回区域横幅后的说明注释', () => {
  const { official } = load('7.4');
  const comment = sectionComment(official, 'INCLUDES');

  expect(comment[0]).toContain('Include one or more other config files here.');
  expect(comment.join('\n')).toContain('include');
});

test('sectionComment 不在生效行截断，取整区说明', () => {
  const { official } = load('7.4');
  const comment = sectionComment(official, 'NETWORK').join('\n');

  expect(comment).toContain('bind 127.0.0.1 -::1');
  expect(comment).toContain('only accepts local connections');
  expect(comment).toContain('somaxconn');
  expect(comment).toContain('SO_KEEPALIVE');
  expect(comment).toContain('route table ID');
  expect(comment).not.toContain('TLS/SSL');
});

test('可替换行跳过模板占位符', () => {
  const { dict, official } = load('7.4');
  const draft: ConfiguratorDraft = { ...emptyDraft('7.4'), values: { save: '900 1' } };
  const output = renderConfig(official, dict, draft);
  const occurrences = lineStartingWith(output, 'save');

  expect(output).toContain('# save <seconds> <changes>');
  expect(activeLines(output, 'save')).toEqual(['save 900 1']);
  expect(occurrences.length).toBeGreaterThan(1);
});

test('scenario 选项在版本步后插入四个问卷步', () => {
  const { dict } = load('7.4');
  const plain = buildSteps(dict);
  const withScenario = buildSteps(dict, { scenario: true });

  expect(withScenario.length).toBe(plain.length + 4);
  const inserted = withScenario.slice(1, 5);
  expect(inserted.map((step) => step.id)).toEqual([
    '__scenario_profile__',
    '__scenario_resource__',
    '__scenario_persistence__',
    '__scenario_access__',
  ]);
  expect(inserted.every((step) => step.kind === 'scenario')).toBe(true);
  expect(withScenario[0].kind).toBe('version');
  expect(withScenario.slice(5)).toEqual(plain.slice(1));
});

test('不传 scenario 选项时步骤与现状一致', () => {
  const { dict } = load('7.4');
  expect(buildSteps(dict, { scenario: false })).toEqual(buildSteps(dict));
  expect(buildSteps(dict).some((step) => step.kind === 'scenario')).toBe(false);
});

test('replica-sentinel 场景插入三个问卷步', () => {
  const { dict } = load('7.4');
  const plain = buildSteps(dict);
  const replSteps = buildSteps(dict, { scenario: true, scenarioId: 'replica-sentinel' });

  expect(replSteps.length).toBe(plain.length + 3);
  const inserted = replSteps.slice(1, 4);
  expect(inserted.map((step) => step.id)).toEqual(['__repl_resource__', '__repl_persistence__', '__repl_network__']);
  expect(inserted.every((step) => step.kind === 'scenario')).toBe(true);
  expect(replSteps.slice(4)).toEqual(plain.slice(1));
});

test('cluster 场景插入三个问卷步', () => {
  const { dict } = load('7.4');
  const plain = buildSteps(dict);
  const clusterSteps = buildSteps(dict, { scenario: true, scenarioId: 'cluster' });

  expect(clusterSteps.length).toBe(plain.length + 3);
  const inserted = clusterSteps.slice(1, 4);
  expect(inserted.map((step) => step.id)).toEqual([
    '__cluster_resource__',
    '__cluster_persistence__',
    '__cluster_network__',
  ]);
  expect(inserted.every((step) => step.kind === 'scenario')).toBe(true);
  expect(clusterSteps.slice(4)).toEqual(plain.slice(1));
});

test('6.2 集群节点文件按字典滤掉 cluster-config-file，7.4 正常写回', () => {
  const answers: ClusterAnswers = {
    ...emptyClusterAnswers(),
    nodeIp: '10.0.0.5',
    password: 's3cret',
    persistence: 'mixed',
    tier: '2c4g',
  };

  const renderNode = (version: string): string => {
    const { dict, official } = load(version);
    const { common, nodes } = applyCluster(answers, dict);
    const draft: ConfiguratorDraft = {
      ...emptyDraft(version),
      values: { ...common, ...nodes[0].values },
      scenario: { id: 'cluster', answers, applied: common, nodes },
    };
    return renderConfig(official, dict, draft);
  };

  const legacy = renderNode('6.2');
  expect(activeLines(legacy, 'cluster-config-file')).toEqual([]);
  expect(activeLines(legacy, 'port')).toEqual(['port 7000']);
  expect(activeLines(legacy, 'dir')).toEqual(['dir /var/lib/redis/7000']);

  const modern = renderNode('7.4');
  expect(activeLines(modern, 'cluster-config-file')).toEqual(['cluster-config-file nodes-7000.conf']);
});
