import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { exportOriginal, exportWithComments, suggestFileName } from '../src/lib/exportConf';
import { parseConf } from '../src/lib/parseConf';

const dict = JSON.parse(readFileSync('tests/fixtures/dict-small.json', 'utf8'));

test('original export only normalises line endings and keeps one trailing newline', () => {
  expect(exportOriginal('a 1\r\nb 2\r\n\r\n')).toBe('a 1\nb 2\n');
});

test('comment export leaves already documented lines alone', () => {
  const text = '# I wrote this\nmaxclients 500\n';
  expect(exportWithComments(parseConf(text), dict)).toBe(text);
});

test('comment export adds official text plus the default value line', () => {
  const out = exportWithComments(parseConf('maxmemory 1gb\n'), dict);
  expect(out).toContain('# 默认值: 0');
  expect(out).toContain('# Set a memory usage limit.');
  expect(out).toContain('maxmemory 1gb');
});

test('comment export is idempotent', () => {
  const once = exportWithComments(parseConf('maxmemory 1gb\n'), dict);
  expect(exportWithComments(parseConf(once), dict)).toBe(once);
});

test('suggests a download name', () => {
  expect(suggestFileName('redis.prod.conf')).toBe('redis.prod-edited.conf');
  expect(suggestFileName(null)).toBe('redis-edited.conf');
});
