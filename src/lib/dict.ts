import type { DictFile, MetaIndex, ReleaseMeta } from '../types';
import releasesJson from '../data/releases.json';

const modules = import.meta.glob<DictFile>('../data/dict/*.json');
const officialModules = import.meta.glob<string>('../data/official/*.conf', {
  query: '?raw',
  import: 'default',
});

export const RELEASES = releasesJson as ReleaseMeta[];

export const VERSIONS = RELEASES.map((release) => release.line);

export function formatVersionLabel(release: ReleaseMeta): string {
  const date = release.publishedAt ? release.publishedAt.slice(0, 10) : '';
  return [release.line, release.tag, date].filter(Boolean).join(' · ');
}

const DEFAULT_VERSION = '7.4';

const cache = new Map<string, DictFile>();

export async function loadDict(line: string): Promise<DictFile> {
  const key = `../data/dict/${line}.json`;
  const load = modules[key];
  if (!load) throw new Error(`没有 ${line} 版本的字典`);
  const cached = cache.get(line);
  if (cached) return cached;
  const dict = await load();
  cache.set(line, dict);
  return dict;
}

export async function loadMeta(): Promise<MetaIndex> {
  const load = modules['../data/dict/meta.json'];
  if (!load) throw new Error('缺少 meta.json');
  return (await load()) as unknown as MetaIndex;
}

export async function loadOfficialConf(line: string): Promise<string> {
  const load = officialModules[`../data/official/${line}.conf`];
  if (!load) throw new Error(`没有 ${line} 的官方 conf`);
  return await load();
}

export { DEFAULT_VERSION };
