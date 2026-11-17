import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

import {
  type LockEntry,
  needsRedownload,
  pickStableReleases,
  type Release,
  type StableRelease,
} from './lib/releases.ts';

const API = 'https://api.github.com/repos/redis/redis/releases?per_page=100&page=';
const RAW = 'https://raw.githubusercontent.com/redis/redis/';
const root = new URL('../data/upstream/', import.meta.url);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string, attempt = 1): Promise<string> {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'zilucid-redis-build' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${url}`);
    }
    return await response.text();
  } catch (error) {
    if (attempt >= 3) {
      throw error;
    }
    await sleep(attempt * 1000);
    return fetchText(url, attempt + 1);
  }
}

async function readJson<T>(path: URL, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function collectReleases(): Promise<Release[]> {
  const all: Release[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const parsed: unknown = JSON.parse(await fetchText(`${API}${page}`));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      break;
    }
    all.push(...(parsed as Release[]));
  }
  return all;
}

async function saveLine(line: string, tag: string, force: boolean): Promise<void> {
  const dir = new URL(`${line}/`, root);
  await mkdir(dir, { recursive: true });
  for (const [remote, local] of [
    ['redis.conf', 'redis.conf'],
    ['src/config.c', 'config.c'],
  ] as const) {
    const target = new URL(local, dir);
    const exists = await stat(target)
      .then((info) => info.size > 0)
      .catch(() => false);
    if (exists && !force) {
      continue;
    }
    const body = await fetchText(`${RAW}${tag}/${remote}`);
    await writeFile(target, body);
  }
}

const versions = JSON.parse(await readFile(new URL('../data/versions.json', import.meta.url), 'utf8')) as Array<{
  line: string;
}>;
const lockPath = new URL('lock.json', root);
const previous = await readJson<Record<string, LockEntry | string>>(lockPath, {});

let releases: Release[] = [];
try {
  releases = await collectReleases();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`release 列表获取失败，沿用 lock.json：${message}`);
}

const picked: StableRelease[] = releases.length
  ? pickStableReleases(
      releases,
      versions.map(({ line }) => line),
    )
  : [];
const byLine = new Map(picked.map((entry) => [entry.line, entry] as const));

const lock: Record<string, LockEntry | string> = { ...previous };
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
    next?.publishedAt ??
    (typeof previousEntry === 'object' && previousEntry !== null ? (previousEntry.publishedAt ?? '') : '');
  const force = needsRedownload(previousEntry, tag);
  lock[line] = { tag, publishedAt };
  await saveLine(line, tag, force);
  console.log(`ok ${line} ${tag}${force ? ' (refetch)' : ''}`);
}

await mkdir(root, { recursive: true });
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
