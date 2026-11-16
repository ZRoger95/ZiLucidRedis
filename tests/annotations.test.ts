import { expect, test } from 'vitest';
import { buildAnnotationBlocks } from '../src/lib/annotations';
import { parseConf } from '../src/lib/parseConf';

const doc = (name: string) => ({
  name,
  section: 'NETWORK',
  type: 'string',
  defaultValue: '10000',
  defaultSource: 'config.c',
  range: null,
  sensitive: false,
  modifiable: true,
  comment: ['line one', 'line two'],
});
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
