import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import { buildDictionary, buildMeta, buildReleasesList } from '../../scripts/build-dict.ts';
import { parseConfigC } from '../../scripts/lib/parse-config-c.ts';
import { parseOfficialConf } from '../../scripts/lib/parse-official-conf.ts';

const fixture = (path: string) => readFileSync(path, 'utf8');
const dict = buildDictionary({
  line: '7.4',
  tag: '7.4.5',
  configC: parseConfigC(fixture('tests/fixtures/config-sample.c')),
  officialConf: parseOfficialConf(fixture('tests/fixtures/official-sample.conf')),
}) as any;
const byName = new Map<string, any>(dict.directives.map((directive: any) => [directive.name, directive]));

test('defaults come from config.c and comments from the conf', () => {
  expect(byName.get('maxclients')!.defaultValue).toBe('10000');
  expect(byName.get('maxclients')!.defaultSource).toBe('config.c');
  expect(byName.get('tcp-backlog')!.comment.length).toBeGreaterThan(0);
});

test('special directives take the last concrete commented value', () => {
  expect(byName.get('save')!.defaultValue).toBe('3600 1 300 100');
  expect(byName.get('save')!.defaultSource).toBe('conf-comment');
});

test('every directive is assigned to a section', () => {
  expect(byName.get('maxclients')!.section).toBe('NETWORK');
  expect(byName.get('save')!.section).toBe('SNAPSHOTTING');
});

test('meta records introduction and removal across lines', () => {
  const meta = buildMeta([
    dict,
    { ...dict, line: '8.0', directives: dict.directives.filter((directive: any) => directive.name !== 'tcp-backlog') },
  ]) as any;
  expect(meta['tcp-backlog'].removedIn).toBe('8.0');
  expect(meta['maxclients'].removedIn).toBeNull();
});

test('dictionary carries publishedAt', () => {
  const withDate = buildDictionary({
    line: '7.4',
    tag: '7.4.12',
    publishedAt: '2026-10-26T11:51:13Z',
    configC: parseConfigC(fixture('tests/fixtures/config-sample.c')),
    officialConf: parseOfficialConf(fixture('tests/fixtures/official-sample.conf')),
  }) as any;
  expect(withDate.publishedAt).toBe('2026-10-26T11:51:13Z');
});

test('releases list follows the version allowlist order', () => {
  const lock = {
    '8.10': { tag: '8.10.3', publishedAt: '2026-10-26T11:56:24Z' },
    '7.4': { tag: '7.4.12', publishedAt: '2026-10-26T11:51:13Z' },
  };
  expect(buildReleasesList(lock, [{ line: '7.4' }, { line: '8.10' }])).toEqual([
    { line: '7.4', tag: '7.4.12', publishedAt: '2026-10-26T11:51:13Z' },
    { line: '8.10', tag: '8.10.3', publishedAt: '2026-10-26T11:56:24Z' },
  ]);
});

test('extras 只补官方 conf 里存在、且 config.c 没提取到的指令', () => {
  const extras = {
    bind: { type: 'special', defaultValue: null, range: null, sensitive: false, modifiable: true },
    save: { type: 'special', defaultValue: '999 1', range: null, sensitive: false, modifiable: true },
    ghost: { type: 'special', defaultValue: '', range: null, sensitive: false, modifiable: true },
  };
  const withExtras = buildDictionary({
    line: '7.4',
    tag: '7.4.5',
    configC: parseConfigC(fixture('tests/fixtures/config-sample.c')),
    officialConf: parseOfficialConf(fixture('tests/fixtures/official-sample.conf')),
    extras,
  }) as any;

  const bind = withExtras.directives.find((directive: any) => directive.name === 'bind');
  // 区域取自官方 conf 中该指令出现的位置（fixture 把示例放在 SNAPSHOTTING 段内）
  expect(bind?.section).toBe('SNAPSHOTTING');
  expect(bind?.defaultSource).toBe('none');
  expect(withExtras.directives.filter((directive: any) => directive.name === 'save')).toHaveLength(1);
  expect(withExtras.directives.find((directive: any) => directive.name === 'save')?.defaultValue).toBe(
    '3600 1 300 100',
  );
  expect(withExtras.directives.some((directive: any) => directive.name === 'ghost')).toBe(false);
});
