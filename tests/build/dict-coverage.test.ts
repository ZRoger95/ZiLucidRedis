import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import { FREE_LINE_NAMES } from '../../src/lib/freeLines';

const VERSIONS = readdirSync('src/data/dict')
  .filter((file) => file.endsWith('.json') && file !== 'meta.json')
  .map((file) => file.replace(/\.json$/, ''));

function activeToken(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  const token = trimmed.split(/\s+/)[0];
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(token) ? token : null;
}

test.each(VERSIONS)('%s 的官方 conf 生效指令都能在字典或自由行白名单里找到', (version) => {
  const dict = JSON.parse(readFileSync(`src/data/dict/${version}.json`, 'utf8')) as {
    directives: Array<{ name: string }>;
  };
  const names = new Set(dict.directives.map((directive) => directive.name));
  const missing = new Set<string>();

  for (const line of readFileSync(`src/data/official/${version}.conf`, 'utf8').split(/\r?\n/)) {
    const token = activeToken(line);
    if (token && !names.has(token) && !FREE_LINE_NAMES.has(token)) {
      missing.add(token);
    }
  }

  expect([...missing]).toEqual([]);
});

test('6.2 的特殊指令都进了字典并归到对应区域', () => {
  const dict = JSON.parse(readFileSync('src/data/dict/6.2.json', 'utf8')) as {
    directives: Array<{ name: string; section: string }>;
  };
  const byName = new Map(dict.directives.map((directive) => [directive.name, directive]));
  const expected: Record<string, string> = {
    bind: 'NETWORK',
    logfile: 'GENERAL',
    dir: 'SNAPSHOTTING',
    save: 'SNAPSHOTTING',
    'client-output-buffer-limit': 'ADVANCED CONFIG',
    'oom-score-adj-values': 'KERNEL OOM CONTROL',
    'notify-keyspace-events': 'EVENT NOTIFICATION',
  };

  for (const [name, section] of Object.entries(expected)) {
    expect(byName.get(name)?.section).toBe(section);
  }
});
