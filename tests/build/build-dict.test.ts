import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDictionary, buildMeta } from '../../scripts/build-dict.mjs';
import { parseConfigC } from '../../scripts/lib/parse-config-c.mjs';
import { parseOfficialConf } from '../../scripts/lib/parse-official-conf.mjs';

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
