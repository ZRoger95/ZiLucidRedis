import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { beforeEach, expect, test } from 'vitest';

import type { ConfiguratorDraft, DictFile, ScenarioAnswers } from '../src/types';

import { emptyDraft } from '../src/lib/configurator';
import {
  DRAFT_KEY,
  draftForStorage,
  loadDraft,
  loadDraftLine,
  saveDraft,
  saveDraftLine,
} from '../src/lib/configuratorState';
import { applyCluster, applyReplication, applyScenario } from '../src/lib/scenario';

const dict = JSON.parse(readFileSync('src/data/dict/7.4.json', 'utf8')) as DictFile;

beforeEach(() => {
  localStorage.clear();
});

const draft: ConfiguratorDraft = {
  ...emptyDraft('7.4'),
  values: { port: '6380', requirepass: 'hunter2', masteruser: 'admin' },
  include: ['/etc/redis/*.conf'],
  user: ['user alice on >secret ~* +@all'],
};

test('保存前剔除敏感字段与 ACL 用户行', () => {
  const stored = draftForStorage(draft, dict);

  expect(stored.values).toEqual({ port: '6380' });
  expect(stored.user).toEqual([]);
  expect(stored.include).toEqual(['/etc/redis/*.conf']);
  expect(draft.values.requirepass).toBe('hunter2');
});

test('草稿按版本恢复，版本不符返回 null', () => {
  saveDraft(draft, dict);

  expect(loadDraft('7.4')?.values).toEqual({ port: '6380' });
  expect(localStorage.getItem(DRAFT_KEY)).not.toContain('hunter2');
  expect(loadDraft('8.2')).toBeNull();
});

test('损坏的草稿返回 null', () => {
  localStorage.setItem(DRAFT_KEY, '{');
  expect(loadDraft('7.4')).toBeNull();
});

test('所选版本单独保存，清空草稿不影响版本', () => {
  saveDraftLine('8.2');
  expect(loadDraftLine()).toBe('8.2');
});

const scenarioDraft: ConfiguratorDraft = {
  ...emptyDraft('7.4'),
  values: { maxmemory: '3gb', requirepass: 'hunter2' },
  scenario: {
    id: 'single-standalone',
    answers: {
      access: 'intranet',
      bindIp: '10.0.0.5',
      password: 'hunter2',
      persistence: 'mixed',
      profile: 'dedicated',
      tier: '2c4g',
    } as ScenarioAnswers,
    applied: { maxmemory: '3gb', requirepass: 'hunter2' },
  },
};

test('保存前剔除 scenario.applied 敏感键与 answers.password', () => {
  const stored = draftForStorage(scenarioDraft, dict);

  expect(stored.scenario?.applied).toEqual({ maxmemory: '3gb' });
  expect(stored.scenario?.answers.password).toBeUndefined();
  expect((stored.scenario?.answers as ScenarioAnswers).bindIp).toBe('10.0.0.5');
  expect(stored.values).toEqual({ maxmemory: '3gb' });
});

test('场景草稿落盘不含明文密码且可恢复', () => {
  saveDraft(scenarioDraft, dict);

  expect(localStorage.getItem(DRAFT_KEY)).not.toContain('hunter2');
  const loaded = loadDraft('7.4');
  expect(loaded?.scenario?.applied.maxmemory).toBe('3gb');
  expect(loaded?.scenario?.answers.password).toBeUndefined();
  expect(loaded?.values.requirepass).toBeUndefined();
});

test('无 scenario 的旧草稿保存行为不变', () => {
  const stored = draftForStorage(draft, dict);
  expect(stored.scenario).toBeUndefined();
});

const replDraft: ConfiguratorDraft = {
  ...emptyDraft('7.4'),
  values: { maxmemory: '3gb' },
  scenario: {
    id: 'replica-sentinel',
    answers: {
      profile: 'dedicated',
      tier: '2c4g',
      persistence: 'mixed',
      access: 'intranet',
      masterHost: '10.0.0.5',
      password: 'hunter2',
    },
    applied: { requirepass: 'hunter2' },
    nodes: [
      {
        role: 'replica1',
        kind: 'redis',
        fileName: 'redis-replica1-6380.conf',
        title: '从库 1',
        values: { masterauth: 'hunter2', port: '6380' },
      },
      {
        role: 'sentinel1',
        kind: 'sentinel',
        fileName: 'sentinel1-26379.conf',
        title: '哨兵 1',
        values: { 'auth-pass': 'hunter2' },
      },
    ],
  },
};

test('保存前剔除节点快照敏感值与 answers.password', () => {
  const stored = draftForStorage(replDraft, dict);
  const replica = stored.scenario?.nodes?.find((node) => node.role === 'replica1')!;
  expect(replica.values).toEqual({ port: '6380' });
  const sentinel = stored.scenario?.nodes?.find((node) => node.role === 'sentinel1')!;
  expect(sentinel.values).toEqual({});
  expect(stored.scenario?.answers.password).toBeUndefined();
});

test('replication 场景草稿落盘不含明文且节点可恢复', () => {
  saveDraft(replDraft, dict);
  expect(localStorage.getItem(DRAFT_KEY)).not.toContain('hunter2');
  const loaded = loadDraft('7.4');
  expect(loaded?.scenario?.nodes).toHaveLength(2);
});

test('任意植入密码经预设与守卫后不落盘', () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...chars), { maxLength: 20, minLength: 8 }).map((letters) => letters.join('')),
      (password) => {
        const answers = {
          access: 'public' as const,
          password,
          persistence: 'mixed' as const,
          profile: 'dedicated' as const,
          tier: '2c4g',
        };
        const { values } = applyScenario(answers, dict);
        const planted: ConfiguratorDraft = {
          ...emptyDraft('7.4'),
          values,
          scenario: { id: 'single-standalone', answers, applied: values },
        };
        saveDraft(planted, dict);
        expect(localStorage.getItem(DRAFT_KEY) ?? '').not.toContain(password);
      },
    ),
    { numRuns: 100 },
  );
});

test('任意植入密码经 replication 预设与守卫后不落盘', () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...chars), { maxLength: 20, minLength: 8 }).map((letters) => letters.join('')),
      (password) => {
        const answers = {
          access: 'intranet' as const,
          masterHost: '10.0.0.5',
          password,
          persistence: 'mixed' as const,
          profile: 'dedicated' as const,
          tier: '2c4g',
        };
        const { nodes } = applyReplication(answers, dict);
        const planted: ConfiguratorDraft = {
          ...emptyDraft('7.4'),
          scenario: { id: 'replica-sentinel', answers, applied: {}, nodes },
        };
        saveDraft(planted, dict);
        expect(localStorage.getItem(DRAFT_KEY) ?? '').not.toContain(password);
      },
    ),
    { numRuns: 100 },
  );
});

test('任意植入密码经 cluster 预设与守卫后不落盘', () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...chars), { maxLength: 20, minLength: 8 }).map((letters) => letters.join('')),
      (password) => {
        const answers = {
          access: 'intranet' as const,
          nodeIp: '10.0.0.5',
          password,
          persistence: 'mixed' as const,
          profile: 'dedicated' as const,
          tier: '2c4g',
        };
        const { common, nodes } = applyCluster(answers, dict);
        const planted: ConfiguratorDraft = {
          ...emptyDraft('7.4'),
          values: common,
          scenario: { id: 'cluster', answers, applied: common, nodes },
        };
        saveDraft(planted, dict);
        expect(localStorage.getItem(DRAFT_KEY) ?? '').not.toContain(password);
      },
    ),
    { numRuns: 100 },
  );
});
