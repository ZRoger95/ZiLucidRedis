import { expect, test } from 'vitest';
import { formatBytes, normalizeValue, parseMemory } from '../src/lib/normalize';

const doc = (type: string, defaultValue: string | null = null) => ({ type, defaultValue }) as any;

test('memory units compare by bytes', () => {
  expect(parseMemory('1gb')).toBe(1073741824);
  expect(parseMemory('1024mb')).toBe(1073741824);
  expect(formatBytes(1073741824)).toBe('1gb');
});

test('maxmemory 1gb equals a dictionary default of 1024mb', () => {
  expect(normalizeValue(doc('ulonglong', '1024mb'), ['1gb'])).toBe(
    normalizeValue(doc('ulonglong', '1024mb'), ['1024mb']),
  );
});

test('enum and bool values are case insensitive', () => {
  expect(normalizeValue(doc('enum'), ['NoEviction'])).toBe(normalizeValue(doc('enum'), ['noeviction']));
  expect(normalizeValue(doc('bool'), ['YES'])).toBe(normalizeValue(doc('bool'), ['yes']));
});

test('whitespace and quote styles do not matter for plain strings', () => {
  expect(normalizeValue(doc('sds', ''), ['  "a  b"  '])).toBe('a b');
});

test('empty arg list normalises to empty string', () => {
  expect(normalizeValue(doc('string', ''), [])).toBe('');
});
