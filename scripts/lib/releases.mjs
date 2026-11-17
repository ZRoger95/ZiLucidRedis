const STABLE_TAG = /^(\d+)\.(\d+)\.(\d+)$/;

const lineParts = (line) => line.split('.').map(Number);

const compareLines = (a, b) => {
  const left = lineParts(a);
  const right = lineParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

export function pickStableReleases(releases, lines) {
  const allow = new Set(lines);
  const best = new Map();

  for (const release of releases) {
    if (!release || release.draft || release.prerelease) continue;
    const match = STABLE_TAG.exec(release.tag_name ?? '');
    if (!match) continue;

    const line = `${match[1]}.${match[2]}`;
    if (!allow.has(line)) continue;

    const patch = Number(match[3]);
    const current = best.get(line);
    if (current && current.patch >= patch) continue;

    best.set(line, {
      patch,
      tag: release.tag_name,
      publishedAt: release.published_at ?? '',
    });
  }

  return [...best.entries()]
    .sort(([a], [b]) => compareLines(a, b))
    .map(([line, entry]) => ({ line, tag: entry.tag, publishedAt: entry.publishedAt }));
}

export function needsRedownload(previousEntry, nextTag) {
  if (!previousEntry) return true;
  if (typeof previousEntry === 'string') return previousEntry !== nextTag;
  return previousEntry.tag !== nextTag;
}
