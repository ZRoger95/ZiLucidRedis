import { expect, test } from 'vitest';
import { diffSegments } from '../src/lib/diff';

test('marks changed value tokens and keeps shared prefix unmarked', () => {
  expect(diffSegments('maxmemory 0', 'maxmemory 8gb')).toEqual({
    left: [{ text: 'maxmemory ', changed: false }, { text: '0', changed: true }],
    right: [{ text: 'maxmemory ', changed: false }, { text: '8gb', changed: true }],
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
