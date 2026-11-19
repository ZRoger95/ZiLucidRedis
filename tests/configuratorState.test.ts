import { readFileSync } from 'node:fs';
import { beforeEach, expect, test } from 'vitest';

import type { ConfiguratorDraft, DictFile } from '../src/types';

import { emptyDraft } from '../src/lib/configurator';
import {
  DRAFT_KEY,
  draftForStorage,
  loadDraft,
  loadDraftLine,
  saveDraft,
  saveDraftLine,
} from '../src/lib/configuratorState';

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
