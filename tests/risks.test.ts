import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import { analyze } from '../src/lib/analyze';
import { parseConf } from '../src/lib/parseConf';
import { evaluateRisks } from '../src/lib/risks';

const dict = JSON.parse(readFileSync('tests/fixtures/dict-small.json', 'utf8'));
const run = (text: string) => evaluateRisks(analyze(parseConf(text), dict, {}, '7.4', {}), dict);

test('protected-mode no without a password is high risk', () => {
  const [warning] = run('protected-mode no\n');
  expect(warning.id).toBe('no-auth-protected-mode-off');
  expect(warning.level).toBe('high');
  expect(warning.source).toBe('explicit');
});

test('a warning driven by a default value says so', () => {
  const warning = run('maxmemory-policy allkeys-lru\n').find((item) => item.id === 'policy-without-limit');
  expect(warning!.source).toBe('default');
});

test('no persistence is high risk', () => {
  expect(run('appendonly no\nsave ""\n').some((warning) => warning.id === 'no-persistence')).toBe(true);
});

test('an empty file raises no rule that needs an explicit line', () => {
  expect(run('').filter((warning) => warning.source === 'explicit')).toEqual([]);
});
