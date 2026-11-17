import { expect, test } from 'vitest';
import { formatVersionLabel } from '../src/lib/dict';

test('version label shows line, patch and date when available', () => {
  expect(formatVersionLabel({ line: '7.4', tag: '7.4.12', publishedAt: '2026-10-26T11:51:13Z' })).toBe(
    '7.4 · 7.4.12 · 2026-10-26',
  );
  expect(formatVersionLabel({ line: '7.4', tag: '7.4.12', publishedAt: '' })).toBe('7.4 · 7.4.12');
});
