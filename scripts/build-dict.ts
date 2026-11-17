import type { ConfigCResult } from './lib/parse-config-c.ts';
import type { OfficialConf, OfficialSection } from './lib/parse-official-conf.ts';
import type { LockEntry, StableRelease } from './lib/releases.ts';

export type DefaultSource = 'config.c' | 'conf-comment' | 'override' | 'none';

export interface DictDirective {
  name: string;
  section: string;
  type: string;
  defaultValue: string | null;
  defaultSource: DefaultSource;
  range: string | null;
  sensitive: boolean;
  modifiable: boolean;
  comment: string[];
}

export interface DictFile {
  line: string;
  tag: string;
  publishedAt: string;
  sections: OfficialSection[];
  directives: DictDirective[];
}

export interface MetaEntry {
  introducedIn: string;
  removedIn: string | null;
  renamedTo: string | null;
}

export interface VersionEntry {
  line: string;
}

export type Lock = Record<string, LockEntry | string | undefined>;

export interface BuildDictionaryInput {
  line: string;
  tag: string;
  publishedAt?: string;
  configC: ConfigCResult;
  officialConf: OfficialConf;
  overrides?: Record<string, string>;
}

const lineParts = (line: string): number[] => line.split('.').map(Number);

export function compareLines(a: string, b: string): number {
  const left = lineParts(a);
  const right = lineParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function buildDictionary({
  line,
  tag,
  publishedAt = '',
  configC,
  officialConf,
  overrides = {},
}: BuildDictionaryInput): DictFile {
  const directives = configC.entries.map((entry) => {
    const official = officialConf.byName.get(entry.name);
    const commented = official?.commentedValues ?? [];
    let defaultValue = entry.defaultValue;
    let defaultSource: DefaultSource = defaultValue === null ? 'none' : 'config.c';

    if (Object.prototype.hasOwnProperty.call(overrides, entry.name)) {
      defaultValue = overrides[entry.name];
      defaultSource = 'override';
    } else if (defaultValue === null && commented.length) {
      defaultValue = commented[commented.length - 1].join(' ');
      defaultSource = 'conf-comment';
    }

    return {
      name: entry.name,
      section: official?.section ?? 'MISC',
      type: entry.type,
      defaultValue,
      defaultSource,
      range: entry.range,
      sensitive: entry.sensitive,
      modifiable: entry.modifiable,
      comment: official?.comment ?? [],
    };
  });

  return { line, tag, publishedAt, sections: officialConf.sections, directives };
}

export function buildReleasesList(lock: Lock, versions: VersionEntry[]): StableRelease[] {
  return versions
    .map(({ line }): StableRelease | null => {
      const entry = lock[line];
      if (!entry || typeof entry === 'string' || !entry.tag) {
        return null;
      }
      return { line, tag: entry.tag, publishedAt: entry.publishedAt ?? '' };
    })
    .filter((entry): entry is StableRelease => entry !== null);
}

export function buildMeta(dicts: DictFile[], renames: Record<string, string> = {}): Record<string, MetaEntry> {
  const sorted = [...dicts].sort((a, b) => compareLines(a.line, b.line));
  const names = new Set<string>();
  for (const dict of sorted) {
    for (const directive of dict.directives) {
      names.add(directive.name);
    }
  }

  const meta: Record<string, MetaEntry> = {};
  for (const name of names) {
    const presentAt = sorted
      .map((dict, index) => (dict.directives.some((directive) => directive.name === name) ? index : -1))
      .filter((index) => index >= 0);
    const introducedIn = sorted[presentAt[0]].line;
    const lastPresent = presentAt[presentAt.length - 1];
    meta[name] = {
      introducedIn,
      removedIn: lastPresent < sorted.length - 1 ? sorted[lastPresent + 1].line : null,
      renamedTo: renames[name] ?? null,
    };
  }
  return meta;
}

const here = (path: string): URL => new URL(path, import.meta.url);

async function main(): Promise<void> {
  const { mkdir, readFile, writeFile } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url !== pathToFileURL(process.argv[1] ?? '').href) {
    return;
  }

  const { parseConfigC } = await import('./lib/parse-config-c.ts');
  const { parseOfficialConf } = await import('./lib/parse-official-conf.ts');

  const versions = JSON.parse(await readFile(here('../data/versions.json'), 'utf8')) as VersionEntry[];
  const lock = JSON.parse(await readFile(here('../data/upstream/lock.json'), 'utf8')) as Lock;
  const overrides = JSON.parse(await readFile(here('../src/data/defaults-override.json'), 'utf8')) as Record<
    string,
    string
  >;
  const allowedNulls = new Set<string>(
    JSON.parse(await readFile(here('../src/data/no-default.json'), 'utf8')) as string[],
  );
  const renames = JSON.parse(await readFile(here('../src/data/renames.json'), 'utf8')) as Record<string, string>;

  await mkdir(here('../src/data/dict/'), { recursive: true });
  await mkdir(here('../src/data/official/'), { recursive: true });

  const dicts: DictFile[] = [];
  const problems: string[] = [];
  for (const { line } of versions) {
    const entry = lock[line];
    if (!entry || typeof entry === 'string' || !entry.tag) {
      problems.push(`${line}: lock.json 没有可用 tag`);
      continue;
    }
    const tag = entry.tag;
    const publishedAt = entry.publishedAt ?? '';
    const [configSource, confSource] = await Promise.all([
      readFile(here(`../data/upstream/${line}/config.c`), 'utf8'),
      readFile(here(`../data/upstream/${line}/redis.conf`), 'utf8'),
    ]);
    const [configC, officialConf] = [parseConfigC(configSource), parseOfficialConf(confSource)];
    const dict = buildDictionary({ line, tag, publishedAt, configC, officialConf, overrides });
    dicts.push(dict);

    if (dict.directives.length < 140 || dict.directives.length > 260) {
      problems.push(`${line}: 指令数 ${dict.directives.length} 不在 140–260`);
    }
    if (dict.sections.length < 8) {
      problems.push(`${line}: 分节数 ${dict.sections.length} < 8`);
    }
    for (const name of ['maxmemory', 'maxmemory-policy', 'protected-mode', 'appendonly', 'requirepass']) {
      const found = dict.directives.find((directive) => directive.name === name);
      if (!found || found.defaultValue === null) {
        problems.push(`${line}: ${name} 没有默认值`);
      }
    }
    for (const directive of dict.directives) {
      if (directive.defaultValue === null && !allowedNulls.has(directive.name)) {
        problems.push(`${line}: ${directive.name} 默认值为 null 但未登记在 no-default.json`);
      }
    }

    await writeFile(here(`../src/data/dict/${line}.json`), `${JSON.stringify(dict)}\n`);
    await writeFile(here(`../src/data/official/${line}.conf`), confSource);
    console.log(`built ${line} ${tag} ${dict.directives.length}`);
  }

  const meta = buildMeta(dicts, renames);
  await writeFile(here('../src/data/dict/meta.json'), `${JSON.stringify(meta)}\n`);

  const releases = buildReleasesList(lock, versions);
  await writeFile(here('../src/data/releases.json'), `${JSON.stringify(releases, null, 2)}\n`);

  if (problems.length) {
    console.error(`\n${problems.length} 处需要人工确认：`);
    for (const problem of [...new Set(problems)]) {
      console.error(`- ${problem}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
