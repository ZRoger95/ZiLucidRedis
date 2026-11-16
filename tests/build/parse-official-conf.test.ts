import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseOfficialConf } from '../../scripts/lib/parse-official-conf.mjs';

const parsed = parseOfficialConf(readFileSync('tests/fixtures/official-sample.conf', 'utf8'));

test('sections are lifted from the banner lines', () => {
  expect(parsed.sections.map((section: any) => section.id)).toEqual(['NETWORK', 'SNAPSHOTTING']);
});

test('comment block directly above the directive is captured', () => {
  expect(parsed.byName.get('tcp-backlog').comment[0]).toContain('TCP listen() backlog');
});

test('a blank line breaks the comment block', () => {
  expect(parsed.byName.get('protected-mode').comment).toEqual([]);
});

test('template lines are not treated as concrete values', () => {
  expect(parsed.byName.get('maxmemory').commentedValues).toEqual([]);
});

test('concrete commented values are kept in file order', () => {
  expect(parsed.byName.get('save').commentedValues).toEqual([[], ['3600', '1', '300', '100']]);
});

test('directives are grouped under their section', () => {
  expect(parsed.byName.get('tcp-backlog').section).toBe('NETWORK');
  expect(parsed.byName.get('save').section).toBe('SNAPSHOTTING');
});
