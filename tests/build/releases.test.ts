import { describe, expect, test } from 'vitest';
import { needsRedownload, pickStableReleases } from '../../scripts/lib/releases.mjs';

const stable = (tag: string, date: string) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: date,
});

describe('pickStableReleases', () => {
  test('filters drafts, prereleases, non X.Y.Z tags and picks newest patch per line', () => {
    const releases = [
      stable('7.4.9', '2026-01-01T00:00:00Z'),
      stable('7.4.12', '2026-10-26T11:51:13Z'),
      { ...stable('7.4.13', '2026-11-01T00:00:00Z'), draft: true },
      { ...stable('8.12.0', '2026-11-12T10:00:00Z'), prerelease: true },
      stable('8.10.3', '2026-10-26T11:56:24Z'),
      stable('9.0.0', '2027-01-01T00:00:00Z'),
      stable('v7.2.1', '2026-01-01T00:00:00Z'),
    ];
    expect(pickStableReleases(releases, ['7.4', '8.10', '8.12'])).toEqual([
      { line: '7.4', tag: '7.4.12', publishedAt: '2026-10-26T11:51:13Z' },
      { line: '8.10', tag: '8.10.3', publishedAt: '2026-10-26T11:56:24Z' },
    ]);
  });
});

describe('needsRedownload', () => {
  test('downloads when tag changed or previous entry is missing/legacy', () => {
    expect(needsRedownload(undefined, '7.4.12')).toBe(true);
    expect(needsRedownload('7.4.12', '7.4.13')).toBe(true);
    expect(needsRedownload({ tag: '7.4.12' }, '7.4.13')).toBe(true);
    expect(needsRedownload({ tag: '7.4.12' }, '7.4.12')).toBe(false);
  });
});
