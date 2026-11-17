import { expect, test } from 'vitest';

import type { DictFile, DirectiveDoc, MetaIndex, RiskWarning } from '../src/types';

import { aliases } from '../src/data/aliases';
import { analyze } from '../src/lib/analyze';
import { applyDefaultLine, buildDiff, diffSegments } from '../src/lib/diff';
import { parseConf } from '../src/lib/parseConf';

test('marks changed value tokens and keeps shared prefix unmarked', () => {
  expect(diffSegments('maxmemory 0', 'maxmemory 8gb')).toEqual({
    left: [
      { text: 'maxmemory ', changed: false },
      { text: '0', changed: true },
    ],
    right: [
      { text: 'maxmemory ', changed: false },
      { text: '8gb', changed: true },
    ],
  });
});

test('identical text has no changed segments', () => {
  expect(diffSegments('appendonly no', 'appendonly no')).toEqual({
    left: [{ text: 'appendonly no', changed: false }],
    right: [{ text: 'appendonly no', changed: false }],
  });
});

test('falls back to whole-side highlight beyond 400 tokens', () => {
  const long = Array.from({ length: 401 }, (_, index) => `t${index}`).join(' ');
  const result = diffSegments(long, `${long} tail`);
  expect(result.left).toEqual([{ text: long, changed: true }]);
  expect(result.right).toEqual([{ text: `${long} tail`, changed: true }]);
});

const doc = (name: string, type: string, defaultValue: string | null): DirectiveDoc => ({
  name,
  section: 'MISC',
  type,
  defaultValue,
  defaultSource: defaultValue === null ? 'none' : 'config.c',
  range: null,
  sensitive: false,
  modifiable: true,
  comment: [],
});

const dict: DictFile = {
  line: '7.4',
  tag: '7.4.12',
  publishedAt: '',
  sections: [],
  directives: [
    doc('maxmemory', 'ulonglong', '0'),
    doc('appendonly', 'bool', 'no'),
    doc('save', 'special', '3600 1 300 100 60 10000'),
    doc('bind', 'special', null),
    doc('logfile', 'string', ''),
    doc('maxmemory-policy', 'enum', 'noeviction'),
    doc('protected-mode', 'bool', 'yes'),
    doc('replicaof', 'special', null),
  ],
};

const run = (
  text: string,
  onlyDiff = false,
  warnings: RiskWarning[] = [],
  meta: MetaIndex = {},
  useDict: DictFile = dict,
) => {
  const analysis = analyze(parseConf(text), useDict, meta, '7.4', aliases);
  return { analysis, model: buildDiff(analysis, useDict, warnings, { onlyDiff }) };
};

test('marks a changed value and exposes the default as applyValue', () => {
  const { model } = run('maxmemory 8gb');
  const row = model.rows.find((item) => item.name === 'maxmemory')!;
  expect(row.kind).toBe('changed');
  expect(row.applyValue).toBe('0');
  expect(row.left?.lines[0].lineNo).toBe(1);
  expect(row.right?.lines[0].lineNo).toBe(1);
  expect(model.rows.filter((item) => item.kind === 'added').map((item) => item.name)).toEqual([
    'maxmemory-policy',
    'appendonly',
    'save',
    'protected-mode',
    'bind',
  ]);
});

test('empty string default is treated as equal and is not applicable', () => {
  const { model } = run('logfile ""');
  const row = model.rows.find((item) => item.name === 'logfile')!;
  expect(row.kind).toBe('default');
  expect(row.canApplyDefault).toBe(false);
});

test('different memory units normalize to the same value', () => {
  const normalized: DictFile = {
    ...dict,
    directives: dict.directives.map((directive) =>
      directive.name === 'maxmemory' ? { ...directive, defaultValue: '1073741824' } : directive,
    ),
  };
  const { model } = run('maxmemory 1gb', false, [], {}, normalized);
  expect(model.rows.find((item) => item.name === 'maxmemory')!.kind).toBe('default');
});

test('multi line save is one block with per line numbers', () => {
  const { model } = run('save 900 1\nsave 300 10');
  const row = model.rows.find((item) => item.name === 'save')!;
  expect(row.kind).toBe('changed');
  expect(row.left?.lines.map((line) => line.lineNo)).toEqual([1, 2]);
  expect(row.right?.lines.length).toBe(1);
  expect(row.canApplyDefault).toBe(false);
});

test('non contiguous duplicates form one block and keep both line numbers', () => {
  const { model } = run('maxmemory 0\nappendonly yes\nmaxmemory 8gb');
  const row = model.rows.find((item) => item.name === 'maxmemory')!;
  expect(row.kind).toBe('duplicate');
  expect(row.left?.lines.map((line) => line.lineNo)).toEqual([1, 3]);
  expect(row.note).toContain('覆盖');
});

test('unknown, special and no-default rows are classified', () => {
  expect(run('foo bar').model.rows.find((item) => item.name === 'foo')!.kind).toBe('unknown');
  expect(run('include /tmp/a.conf').model.rows.find((item) => item.name === 'include')!.kind).toBe('special');
  const bindRow = run('bind 127.0.0.1').model.rows.find((item) => item.name === 'bind')!;
  expect(bindRow.kind).toBe('no-default');
  expect(bindRow.applyValue).toBeNull();
  expect(bindRow.right?.lines[0].segments.map((segment) => segment.text).join('')).toContain('官方无默认值');
});

test('alias keeps the original name and notes the rename', () => {
  const row = run('slaveof 127.0.0.1 6379').model.rows.find((item) => item.name === 'slaveof')!;
  expect(row.canonicalName).toBe('replicaof');
  expect(row.note).toContain('旧名');
});

test('risky default rows survive the onlyDiff filter', () => {
  const warning: RiskWarning = {
    id: 'r',
    level: 'high',
    message: 'm',
    lineNos: [1],
    source: 'explicit',
  };
  const { model } = run('maxmemory 0', true, [warning]);
  const row = model.rows.find((item) => item.name === 'maxmemory')!;
  expect(row.kind).toBe('default');
  expect(row.risks).toHaveLength(1);
});

test('right line numbers stay stable when onlyDiff filters rows', () => {
  const all = run('maxmemory 8gb\nappendonly yes').model;
  const filtered = run('maxmemory 8gb\nappendonly yes', true).model;
  const rightNo = (model: typeof all, name: string) =>
    model.rows.find((item) => item.name === name)?.right?.lines[0].lineNo;
  expect(rightNo(filtered, 'maxmemory')).toBe(rightNo(all, 'maxmemory'));
  expect(rightNo(filtered, 'bind')).toBe(rightNo(all, 'bind'));
});

test('comments, blanks and templates do not create diff rows', () => {
  const { model } = run('# c\n\nmaxmemory 0\n<template>');
  expect(model.rows.some((item) => item.kind === 'unknown')).toBe(false);
  expect(model.rows.find((item) => item.name === 'maxmemory')!.left?.lines[0].lineNo).toBe(3);
});

test('empty config produces no diff rows', () => {
  const { model } = run('');
  expect(model.rows).toHaveLength(0);
  expect(model.total).toBe(0);
});

test('replaces args and keeps indentation and directive name', () => {
  expect(applyDefaultLine('  maxmemory 0\nappendonly yes', 1, '8gb')).toBe('  maxmemory 8gb\nappendonly yes');
});

test('writes quoted empty string for empty defaults', () => {
  expect(applyDefaultLine('logfile /var/log/redis.log', 1, '')).toBe('logfile ""');
});

test('exposes quoted empty default as applyValue', () => {
  const row = run('logfile /var/log/redis.log').model.rows.find((item) => item.name === 'logfile')!;
  expect(row.kind).toBe('changed');
  expect(row.applyValue).toBe('""');
});
