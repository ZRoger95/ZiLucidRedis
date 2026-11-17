const lineParts = (line) => line.split('.').map(Number);

export function compareLines(a, b) {
  const left = lineParts(a);
  const right = lineParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function buildDictionary({ line, tag, publishedAt = '', configC, officialConf, overrides = {} }) {
  const directives = configC.entries.map((entry) => {
    const official = officialConf.byName.get(entry.name);
    const commented = official?.commentedValues ?? [];
    let defaultValue = entry.defaultValue;
    let defaultSource = defaultValue === null ? 'none' : 'config.c';

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

export function buildReleasesList(lock, versions) {
  return versions
    .map(({ line }) => {
      const entry = lock[line];
      if (!entry?.tag) return null;
      return { line, tag: entry.tag, publishedAt: entry.publishedAt ?? '' };
    })
    .filter(Boolean);
}

export function buildMeta(dicts, renames = {}) {
  const sorted = [...dicts].sort((a, b) => compareLines(a.line, b.line));
  const names = new Set();
  for (const dict of sorted) for (const directive of dict.directives) names.add(directive.name);

  const meta = {};
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

const here = (path) => new URL(path, import.meta.url);

async function main() {
  const { mkdir, readFile, writeFile } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url !== pathToFileURL(process.argv[1] ?? '').href) return;

  const { parseConfigC } = await import('./lib/parse-config-c.mjs');
  const { parseOfficialConf } = await import('./lib/parse-official-conf.mjs');

  const versions = JSON.parse(await readFile(here('../data/versions.json'), 'utf8'));
  const lock = JSON.parse(await readFile(here('../data/upstream/lock.json'), 'utf8'));
  const overrides = JSON.parse(await readFile(here('../src/data/defaults-override.json'), 'utf8'));
  const allowedNulls = new Set(JSON.parse(await readFile(here('../src/data/no-default.json'), 'utf8')));
  const renames = JSON.parse(await readFile(here('../src/data/renames.json'), 'utf8'));

  await mkdir(here('../src/data/dict/'), { recursive: true });
  await mkdir(here('../src/data/official/'), { recursive: true });

  const dicts = [];
  const problems = [];
  for (const { line } of versions) {
    const entry = lock[line];
    const tag = entry?.tag ?? '';
    if (!tag) {
      problems.push(`${line}: lock.json 没有可用 tag`);
      continue;
    }
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
    if (dict.sections.length < 8) problems.push(`${line}: 分节数 ${dict.sections.length} < 8`);
    for (const name of ['maxmemory', 'maxmemory-policy', 'protected-mode', 'appendonly', 'requirepass']) {
      const found = dict.directives.find((directive) => directive.name === name);
      if (!found || found.defaultValue === null) problems.push(`${line}: ${name} 没有默认值`);
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
    for (const problem of [...new Set(problems)]) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

