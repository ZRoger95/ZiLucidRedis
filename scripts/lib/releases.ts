const STABLE_TAG = /^(\d+)\.(\d+)\.(\d+)$/;

const lineParts = (line: string): number[] => line.split('.').map(Number);

const compareLines = (a: string, b: string): number => {
  const left = lineParts(a);
  const right = lineParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};

export interface Release {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
}

export interface StableRelease {
  line: string;
  tag: string;
  publishedAt: string;
}

export interface LockEntry {
  tag: string;
  publishedAt?: string;
}

export type PreviousRelease = LockEntry | string | undefined;

export function pickStableReleases(releases: Release[], lines: string[]): StableRelease[] {
  const allow = new Set(lines);
  const best = new Map<string, { patch: number; tag: string; publishedAt: string }>();

  for (const release of releases) {
    if (!release || release.draft || release.prerelease) {
      continue;
    }
    const match = STABLE_TAG.exec(release.tag_name ?? '');
    if (!match) {
      continue;
    }

    const line = `${match[1]}.${match[2]}`;
    if (!allow.has(line)) {
      continue;
    }

    const patch = Number(match[3]);
    const current = best.get(line);
    if (current && current.patch >= patch) {
      continue;
    }

    best.set(line, {
      patch,
      tag: release.tag_name ?? '',
      publishedAt: release.published_at ?? '',
    });
  }

  return [...best.entries()]
    .sort(([a], [b]) => compareLines(a, b))
    .map(([line, entry]) => ({ line, tag: entry.tag, publishedAt: entry.publishedAt }));
}

export function needsRedownload(previousEntry: PreviousRelease, nextTag: string): boolean {
  if (!previousEntry) {
    return true;
  }
  if (typeof previousEntry === 'string') {
    return previousEntry !== nextTag;
  }
  return previousEntry.tag !== nextTag;
}
