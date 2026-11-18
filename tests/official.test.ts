import { expect, test } from 'vitest';

import type { DirectiveDoc } from '../src/types';

import { indexOfficialLines, officialAnnotations } from '../src/lib/official';

const conf = `# TCP listen() backlog.
tcp-backlog 511

# maxmemory <bytes>
maxmemory 0
tcp-backlog 1024
`;

const doc = (name: string) =>
  ({
    name,
    section: 'NETWORK',
    type: 'string',
    defaultValue: '511',
    defaultSource: 'config.c',
    range: null,
    sensitive: false,
    modifiable: true,
    comment: ['explained'],
  }) as DirectiveDoc;

test('indexes the first active line of every directive', () => {
  const index = indexOfficialLines(conf);
  expect(index.get('tcp-backlog')).toBe(2);
  expect(index.get('maxmemory')).toBe(5);
});

test('ignores comments and blank lines', () => {
  const index = indexOfficialLines('# only comments\n\n');
  expect(index.size).toBe(0);
});

test('annotates official directives whose own comment block is missing', () => {
  const rows = conf.split('\n');
  const docs = new Map([
    ['tcp-backlog', doc('tcp-backlog')],
    ['maxmemory', doc('maxmemory')],
  ]);
  const annotations = officialAnnotations(rows, docs, 'missing');
  expect([...annotations.keys()]).toEqual([6]);
});

test('summary uses the Chinese note when one is provided', () => {
  const rows = conf.split('\n');
  const docs = new Map([['tcp-backlog', doc('tcp-backlog')]]);
  const annotation = officialAnnotations(rows, docs, 'all', {
    'tcp-backlog': 'TCP 已完成握手的连接队列长度',
  }).get(2);
  expect(annotation?.summary).toBe('TCP 已完成握手的连接队列长度 · 默认值：511');
  expect(annotation?.text.at(-1)).toBe('默认值: 511');
});

test('all mode annotates every official directive', () => {
  const rows = conf.split('\n');
  const docs = new Map([['tcp-backlog', doc('tcp-backlog')]]);
  expect(officialAnnotations(rows, docs, 'all').has(2)).toBe(true);
});

test('off mode annotates nothing', () => {
  const rows = conf.split('\n');
  const docs = new Map([['tcp-backlog', doc('tcp-backlog')]]);
  expect(officialAnnotations(rows, docs, 'off').size).toBe(0);
});
