import { expect, test } from 'vitest';

import { DEFAULT_FIND_OPTIONS, findMatches } from '../src/lib/find';

test('空查询没有命中', () => {
  expect(findMatches('maxmemory 0', '', DEFAULT_FIND_OPTIONS)).toEqual({ matches: [], error: false });
});

test('默认大小写不敏感，并返回行号', () => {
  const text = 'MaxMemory 0\nmaxmemory 1';
  const { matches } = findMatches(text, 'maxmemory', DEFAULT_FIND_OPTIONS);
  expect(matches.map((match) => match.lineNo)).toEqual([1, 2]);
  expect(text.slice(matches[1].from, matches[1].to)).toBe('maxmemory');
});

test('区分大小写时只命中完全一致的大小写', () => {
  const { matches } = findMatches('MaxMemory 0\nmaxmemory 1', 'maxmemory', {
    ...DEFAULT_FIND_OPTIONS,
    caseSensitive: true,
  });
  expect(matches).toHaveLength(1);
  expect(matches[0].lineNo).toBe(2);
});

test('非正则模式下特殊字符按字面匹配', () => {
  const { matches } = findMatches('maxmemory-policy allkeys-lru', 'maxmemory-policy', DEFAULT_FIND_OPTIONS);
  expect(matches).toHaveLength(1);
});

test('全词匹配排除前缀更长的单词', () => {
  const { matches } = findMatches('maxmemory maxmemoryx', 'maxmemory', {
    ...DEFAULT_FIND_OPTIONS,
    wholeWord: true,
  });
  expect(matches).toHaveLength(1);
  expect(matches[0].from).toBe(0);
});

test('正则模式支持 JavaScript 正则', () => {
  const { matches } = findMatches('maxmemory 256mb\nmaxclients 10000', 'max\\w+', {
    ...DEFAULT_FIND_OPTIONS,
    regexp: true,
  });
  expect(matches).toHaveLength(2);
});

test('正则与全词同时开启时仍按词边界过滤', () => {
  const { matches } = findMatches('xmaxmemory maxmemory', 'max\\w+', {
    ...DEFAULT_FIND_OPTIONS,
    regexp: true,
    wholeWord: true,
  });
  expect(matches).toHaveLength(1);
  expect(matches[0].from).toBe(11);
});

test('非法正则返回 error 且没有命中', () => {
  expect(findMatches('maxmemory', '[', { ...DEFAULT_FIND_OPTIONS, regexp: true })).toEqual({
    matches: [],
    error: true,
  });
});

test('零宽正则不会死循环', () => {
  const { matches } = findMatches('a\nb', '^', { ...DEFAULT_FIND_OPTIONS, regexp: true });
  expect(matches).toHaveLength(2);
  expect(matches.map((match) => match.lineNo)).toEqual([1, 2]);
});

test('skipLines 中列出的行不计入命中', () => {
  const { matches } = findMatches('x 1\nx 2\nx 3', 'x', DEFAULT_FIND_OPTIONS, new Set([2]));
  expect(matches.map((match) => match.lineNo)).toEqual([1, 3]);
});
