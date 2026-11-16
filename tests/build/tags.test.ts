import { describe, expect, test } from 'vitest';
import { resolveLatestTag } from '../../scripts/lib/tags.mjs';

describe('resolveLatestTag', () => {
  const tags = ['8.10.3', '8.10.2', '8.2.11', '7.4.12', '7.4.9', '6.2.19', 'v7.0-rc1'];

  test('picks the numerically newest patch for a line', () => {
    expect(resolveLatestTag(tags, '7.4')).toBe('7.4.12');
    expect(resolveLatestTag(tags, '8.10')).toBe('8.10.3');
  });

  test('does not confuse 8.1 with 8.10', () => {
    expect(resolveLatestTag(tags, '8.1')).toBeNull();
  });
});
