import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import { parseConfigC } from '../../scripts/lib/parse-config-c.ts';

const source = readFileSync('tests/fixtures/config-sample.c', 'utf8');
const result = parseConfigC(source);
const byName = new Map(result.entries.map((entry: any) => [entry.name, entry]));

test('bool default becomes yes/no', () => {
  expect(byName.get('protected-mode').defaultValue).toBe('yes');
  expect(byName.get('protected-mode').sensitive).toBe(false);
});

test('uint keeps bounds and default', () => {
  expect(byName.get('maxclients').defaultValue).toBe('10000');
  expect(byName.get('maxclients').range).toBe('1..UINT_MAX');
});

test('memory default is human readable', () => {
  expect(byName.get('maxmemory').defaultValue).toBe('0');
});

test('arithmetic defaults from config.c are evaluated', () => {
  expect(byName.get('repl-backlog-size').defaultValue).toBe('1mb');
});

test('enum default is resolved to its string', () => {
  expect(byName.get('maxmemory-policy').defaultValue).toBe('noeviction');
});

test('sds NULL default is the empty string and sensitive flag is read', () => {
  expect(byName.get('requirepass').defaultValue).toBe('');
  expect(byName.get('requirepass').sensitive).toBe(true);
});

test('multi arg and immutable flags are read', () => {
  expect(byName.get('save').multiArg).toBe(true);
  expect(byName.get('newfangled-option').modifiable).toBe(false);
});

test('unknown create function is reported, not silently dropped', () => {
  expect(result.unresolved).toContain('newfangled-option');
});
