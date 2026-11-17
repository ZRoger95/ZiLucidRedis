import { expect, test } from 'vitest';

import { describeDirective } from '../src/lib/describe';

const doc = {
  name: 'maxmemory',
  section: 'MEMORY',
  type: 'ulonglong',
  defaultValue: '0',
  defaultSource: 'config.c',
  range: null,
  sensitive: false,
  modifiable: true,
  comment: ['Set a memory usage limit.'],
};

test('shows section, default and status', () => {
  const view = describeDirective(doc as any, { lineNo: 3, status: 'changed', doc: doc as any }, {}, false);
  expect(view.section).toBe('MEMORY');
  expect(view.defaultText).toBe('0');
  expect(view.statusText).toBe('已改');
});

test('shows the current value and flags a difference', () => {
  const view = describeDirective(doc as any, { lineNo: 3, status: 'changed' }, {}, false, ['512mb']);
  expect(view.currentText).toBe('512mb');
  expect(view.isDiff).toBe(true);
});

test('unknown directives explain themselves without crashing', () => {
  const view = describeDirective(undefined, { lineNo: 9, status: 'unknown' }, {}, false);
  expect(view.statusText).toContain('未知');
  expect(view.body.length).toBeGreaterThan(0);
});

test('chinese summary is null when the directive has none', () => {
  const view = describeDirective(doc as any, undefined, {}, true);
  expect(view.zhText).toBeNull();
});

test('chinese summary is exposed when enabled and present', () => {
  const view = describeDirective(doc as any, undefined, { maxmemory: '内存上限' }, true);
  expect(view.zhText).toBe('内存上限');
});

test('missing default is phrased clearly', () => {
  const view = describeDirective({ ...doc, defaultValue: null } as any, undefined, {}, false);
  expect(view.defaultText).toContain('官方未给出');
});

test('empty line yields an empty view', () => {
  expect(describeDirective(undefined, undefined, {}, false).name).toBe('');
});
