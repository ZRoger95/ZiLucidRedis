import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolveLatestTag } from './lib/tags.mjs';

const API = 'https://api.github.com/repos/redis/redis/tags?per_page=100&page=';
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

async function collectTags() {
  const names = new Set();
  for (let page = 1; page <= 4; page += 1) {
    const body = await fetchText(`${API}${page}`);
    for (const match of body.matchAll(/"name":\s*"([^"]+)"/g)) names.add(match[1]);
  }
  return [...names];
}

async function saveLine(line, tag) {
  const dir = new URL(`${line}/`, root);
  await mkdir(dir, { recursive: true });
  for (const [remote, local] of [
    ['redis.conf', 'redis.conf'],
    ['src/config.c', 'config.c'],
  ]) {
    const target = new URL(local, dir);
    const exists = await stat(target).then((info) => info.size > 0).catch(() => false);
    if (exists) continue;
    const body = await fetchText(`${RAW}${tag}/${remote}`);
    await writeFile(target, body);
  }
}

const versions = JSON.parse(await readFile(new URL('../data/versions.json', import.meta.url), 'utf8'));
const lockPath = new URL('lock.json', root);
const previous = await readJson(lockPath, {});

let tags = [];
try {
  tags = await collectTags();
} catch (error) {
  console.warn(`tag 列表获取失败，沿用 lock.json：${error.message}`);
}

const lock = { ...previous };
for (const { line } of versions) {
  const resolved = tags.length ? resolveLatestTag(tags, line) : null;
  const tag = resolved ?? previous[line];
  if (!tag) {
    console.warn(`跳过 ${line}：没有可用 tag`);
    continue;
  }
  lock[line] = tag;
  await saveLine(line, tag);
  console.log(`ok ${line} ${tag}`);
}

await mkdir(root, { recursive: true });
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
