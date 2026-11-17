import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import { parseConf } from '../src/lib/parseConf';
import { insertDirective, searchDirectives } from '../src/lib/search';

const dict = JSON.parse(readFileSync('tests/fixtures/dict-small.json', 'utf8'));

test('matches by name, case insensitive', () => {
  expect(searchDirectives(dict, 'MAXMEM', new Set()).map((hit) => hit.name)).toContain('maxmemory');
});

test('matches by chinese summary', () => {
  const hits = searchDirectives(dict, '同时连接', new Set());
  expect(hits.map((hit) => hit.name)).toContain('maxclients');
});

test('marks already configured directives', () => {
  expect(searchDirectives(dict, 'maxmemory', new Set(['maxmemory']))[0].configured).toBe(true);
});

test('inserts a missing directive inside its own section', () => {
  const text =
    '################ NETWORK ################\nmaxclients 500\n\n################ SNAPSHOTTING ################\nsave 3600 1\n';
  const doc = dict.directives.find((directive: any) => directive.name === 'bind');
  const out = insertDirective(text, parseConf(text), doc, dict);
  const rows = out.text.split('\n');
  expect(rows[out.lineNo - 1].startsWith('bind ')).toBe(true);
  expect(out.text.indexOf('bind ')).toBeLessThan(out.text.indexOf('save 3600 1'));
});
