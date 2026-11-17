import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { needsRedownload, pickStableReleases } from './lib/releases.mjs';

const API = 'https://api.github.com/repos/redis/redis/releases?per_page=100&page=';
const RAW = 'https://raw.githubusercontent.com/redis/redis/';
const root = new URL('../data/upstream/', import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url, attempt = 1) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'zilucid-redis-build' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
    return await response.text();
  } catch (error) {
    if (attempt >= 3) throw error;
    await sleep(attempt * 1000);
    return fetchText(url, attempt + 1);
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function collectReleases() {
  const all = [];
  for (let page = 1; page <= 3; page += 1) {
    const parsed = JSON.parse(await fetchText(`${API}${page}`));
    if (!Array.isArray(parsed) || parsed.length === 0) break;
    all.push(...parsed);
  }
  return all;
}

async function saveLine(line, tag, force) {
  const dir = new URL(`${line}/`, root);
  await mkdir(dir, { recursive: true });
  for (const [remote, local] of [
    ['redis.conf', 'redis.conf'],
    ['src/config.c', 'config.c'],
  ]) {
    const target = new URL(local, dir);
    const exists = await stat(target).then((info) => info.size > 0).catch(() => false);
    if (exists && !force) continue;
    const body = await fetchText(`${RAW}${tag}/${remote}`);
    await writeFile(target, body);
  }
}

const versions = JSON.parse(await readFile(new URL('../data/versions.json', import.meta.url), 'utf8'));
const lockPath = new URL('lock.json', root);
const previous = await readJson(lockPath, {});

let releases = [];
try {
  releases = await collectReleases();
} catch (error) {
  console.warn(`release 列表获取失败，沿用 lock.json：${error.message}`);
}

const picked = releases.length
  ? pickStableReleases(releases, versions.map(({ line }) => line))
  : [];
const byLine = new Map(picked.map((entry) => [entry.line, entry]));

const lock = { ...previous };
for (const { line } of versions) {
  const next = byLine.get(line);
  const previousEntry = previous[line];
  const previousTag = typeof previousEntry === 'string' ? previousEntry : previousEntry?.tag;
  const tag = next?.tag ?? previousTag;
  if (!tag) {
    console.warn(`跳过 ${line}：没有可用 release`);
    continue;
  }

  const publishedAt =
    next?.publishedAt ?? (typeof previousEntry === 'object' ? previousEntry.publishedAt : '') ?? '';
  const force = needsRedownload(previousEntry, tag);
  lock[line] = { tag, publishedAt };
  await saveLine(line, tag, force);
  console.log(`ok ${line} ${tag}${force ? ' (refetch)' : ''}`);
}

await mkdir(root, { recursive: true });
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
