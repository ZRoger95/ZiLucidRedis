import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import { parseOfficialConf } from '../../scripts/lib/parse-official-conf.ts';

const parsed = parseOfficialConf(readFileSync('tests/fixtures/official-sample.conf', 'utf8'));
const directive = (name: string) => parsed.byName.get(name)!;

test('sections are lifted from the banner lines', () => {
  expect(parsed.sections.map((section: any) => section.id)).toEqual(['NETWORK', 'SNAPSHOTTING']);
});

test('comment block directly above the directive is captured', () => {
  expect(directive('tcp-backlog').comment[0]).toContain('TCP listen() backlog');
});

test('a blank line breaks the comment block', () => {
  expect(directive('protected-mode').comment).toEqual([]);
});

test('template lines are not treated as concrete values', () => {
  expect(directive('maxmemory').commentedValues).toEqual([]);
});

test('concrete commented values are kept in file order', () => {
  expect(directive('save').commentedValues).toEqual([[], ['3600', '1', '300', '100']]);
});

test('directives are grouped under their section', () => {
  expect(directive('tcp-backlog').section).toBe('NETWORK');
  expect(directive('save').section).toBe('SNAPSHOTTING');
});
