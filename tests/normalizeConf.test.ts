import { expect, test } from 'vitest';

import { normalizeConfig } from '../src/lib/normalizeConf';

const index = new Map([
  ['bind', 1],
  ['maxmemory', 10],
  ['save', 20],
]);

test('drops comments and blank lines', () => {
  const out = normalizeConfig('# 注释\n\nbind 127.0.0.1\n\n# 另一段注释\nsave 60 1\n', index);
  expect(out.text).toBe('bind 127.0.0.1\nsave 60 1\n');
  expect(out.droppedComments).toBe(2);
});

test('orders directives the way the official conf does', () => {
  const out = normalizeConfig('save 60 1\nmaxmemory 512mb\nbind 127.0.0.1\n', index);
  expect(out.text.split('\n').filter(Boolean)).toEqual(['bind 127.0.0.1', 'maxmemory 512mb', 'save 60 1']);
});

test('keeps unknown lines at the end in their original order', () => {
  const out = normalizeConfig('my-module yes\nmaxmemory 1gb\nanother-thing 1\n', index);
  expect(out.text.split('\n').filter(Boolean)).toEqual(['maxmemory 1gb', 'my-module yes', 'another-thing 1']);
  expect(out.unknown).toEqual(['my-module yes', 'another-thing 1']);
});

test('preserves the raw line so quoting survives', () => {
  const out = normalizeConfig('logfile ""\n', new Map([['logfile', 1]]));
  expect(out.text).toBe('logfile ""\n');
});

test('empty input stays empty', () => {
  expect(normalizeConfig('', index).text).toBe('');
});
