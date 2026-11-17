import { expect, test } from 'vitest';

import { decodeConfBytes, parseConf, tokenizeArgs } from '../src/lib/parseConf';

test('separates comments, blanks and directives', () => {
  const lines = parseConf('# c\n\nmaxmemory 100mb\n');
  expect(lines.map((line) => line.kind)).toEqual(['comment', 'blank', 'directive']);
  expect(lines[2].name).toBe('maxmemory');
  expect(lines[2].args).toEqual(['100mb']);
});

test('keeps a trailing hash as part of the value, never as a comment', () => {
  const [line] = parseConf('maxmemory 100mb # tmp');
  expect(line.kind).toBe('directive');
  expect(line.args).toEqual(['100mb', '#', 'tmp']);
});

test('tokenizes quoted passwords without exposing escapes', () => {
  const { args, quoteStyles } = tokenizeArgs('"p@ss \\"x\\"" plain');
  expect(args).toEqual(['p@ss "x"', 'plain']);
  expect(quoteStyles).toEqual(['double', 'plain']);
});

test('strips a UTF-8 BOM and normalises CRLF', () => {
  const bytes = new TextEncoder().encode('\uFEFFmaxclients 100\r\nbind 127.0.0.1\r\n');
  const { text, warning } = decodeConfBytes(bytes.buffer as ArrayBuffer);
  expect(warning).toBeNull();
  expect(parseConf(text).filter((line) => line.kind === 'directive').length).toBe(2);
  expect(text.includes('\r')).toBe(false);
});

test('marks template lines from documentation as unknown', () => {
  const [line] = parseConf('maxmemory <bytes>');
  expect(line.kind).toBe('unknown');
});

test('keeps every original line with its number', () => {
  const lines = parseConf('a 1\n\n# c\n');
  expect(lines.map((line) => line.lineNo)).toEqual([1, 2, 3]);
});
