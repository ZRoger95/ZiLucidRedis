export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolveLatestTag(tags, line) {
  const pattern = new RegExp(`^${escapeRegExp(line)}\\.(\\d+)$`);
  let best = null;
  for (const tag of tags) {
    const match = pattern.exec(tag);
    if (!match) continue;
    const patch = Number(match[1]);
    if (!best || patch > best.patch) best = { tag, patch };
  }
  return best ? best.tag : null;
}
