import { expect, test } from 'vitest';

import type { DirectiveDoc, LineAnalysis } from '../src/types';

import { annotationSummary, buildAnnotationBlocks } from '../src/lib/annotations';
import { parseConf } from '../src/lib/parseConf';

const doc = (name: string, defaultValue: string | null = '10000'): DirectiveDoc => ({
  name,
  section: 'NETWORK',
  type: 'string',
  defaultValue,
  defaultSource: 'config.c',
  range: null,
  sensitive: false,
  modifiable: true,
  comment: ['line one', 'line two'],
});

const notes = {
  'tcp-backlog': 'TCP 已完成握手的连接队列长度',
  port: '监听端口，默认 6379',
  databases: '数据库数量，默认 16 个',
  timeout: '客户端空闲多少秒后断开，0 表示不断开',
  bind: '监听哪些网卡地址，默认监听所有可用地址',
};
const byLine = new Map([
  [2, { lineNo: 2, status: 'changed', doc: doc('maxclients') }],
  [4, { lineNo: 4, status: 'default', doc: doc('maxmemory') }],
] as any);

test('missing mode skips directives that already have a comment above', () => {
  const lines = parseConf('# mine\nmaxclients 500\n\nmaxmemory 0\n');
  expect(buildAnnotationBlocks(lines, byLine as any, 'missing').map((block) => block.atLineNo)).toEqual([4]);
});

test('all mode annotates every known directive', () => {
  const lines = parseConf('# mine\nmaxclients 500\n\nmaxmemory 0\n');
  expect(buildAnnotationBlocks(lines, byLine as any, 'all').length).toBe(2);
});

test('only-diff mode keeps annotations for changed lines only', () => {
  const lines = parseConf('# mine\nmaxclients 500\n\nmaxmemory 0\n');
  expect(buildAnnotationBlocks(lines, byLine as any, 'all', true).map((block) => block.atLineNo)).toEqual([2]);
});

test('off mode yields nothing', () => {
  expect(buildAnnotationBlocks(parseConf('maxclients 500\n'), byLine as any, 'off')).toEqual([]);
});

test('block text ends with the default value line', () => {
  const [block] = buildAnnotationBlocks(parseConf('# 说明\nmaxclients 500\n'), byLine as any, 'all');
  expect(block.text.at(-1)).toBe('默认值: 10000');
});

test('summary prefers the Chinese note and appends the default value', () => {
  expect(annotationSummary(doc('tcp-backlog', '511'), notes)).toBe('TCP 已完成握手的连接队列长度 · 默认值：511');
});

test('summary drops a redundant default clause that matches the dictionary value', () => {
  expect(annotationSummary(doc('port', '6379'), notes)).toBe('监听端口 · 默认值：6379');
  expect(annotationSummary(doc('databases', '16'), notes)).toBe('数据库数量 · 默认值：16');
});

test('summary keeps a clause that is not a duplicate of the default value', () => {
  expect(annotationSummary(doc('timeout', '0'), notes)).toBe('客户端空闲多少秒后断开，0 表示不断开 · 默认值：0');
  expect(annotationSummary(doc('bind', null), notes)).toBe(
    '监听哪些网卡地址，默认监听所有可用地址 · 默认值：官方未给出',
  );
});

test('summary falls back to the original wording when no Chinese note exists', () => {
  expect(annotationSummary(doc('maxclients', '10000'), notes)).toBe('官方注释 · 默认值：10000');
  expect(annotationSummary(doc('bind', null), {})).toBe('官方注释 · 默认值：官方未给出');
});

test('blocks carry the Chinese summary', () => {
  const lines = parseConf('tcp-backlog 511\n');
  const docs = new Map<number, LineAnalysis>([[1, { lineNo: 1, status: 'changed', doc: doc('tcp-backlog', '511') }]]);
  const [block] = buildAnnotationBlocks(lines, docs, 'all', false, notes);
  expect(block.summary).toBe('TCP 已完成握手的连接队列长度 · 默认值：511');
});
