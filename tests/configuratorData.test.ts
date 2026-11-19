import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import registry from '../src/data/configurator.json';

interface DictShape {
  sections: Array<{ id: string }>;
  directives: Array<{ name: string; section: string; type: string }>;
}

const DICTS = readdirSync('src/data/dict')
  .filter((file) => file.endsWith('.json') && file !== 'meta.json')
  .map((file) => JSON.parse(readFileSync(`src/data/dict/${file}`, 'utf8')) as DictShape);

test('每个区域都有中文名与说明', () => {
  const ids = new Set<string>();
  for (const dict of DICTS) {
    for (const section of dict.sections) {
      ids.add(section.id);
    }
    for (const directive of dict.directives) {
      ids.add(directive.section);
    }
  }

  const missing = [...ids].filter((id) => !registry.sections[id as keyof typeof registry.sections]);
  expect(missing).toEqual([]);

  for (const id of ids) {
    const meta = registry.sections[id as keyof typeof registry.sections];
    expect(meta.name.length).toBeGreaterThan(0);
    expect(meta.summary.length).toBeGreaterThan(0);
  }
});

test('每个 enum 指令都登记了至少两个候选值', () => {
  const names = new Set<string>();
  for (const dict of DICTS) {
    for (const directive of dict.directives) {
      if (directive.type === 'enum') {
        names.add(directive.name);
      }
    }
  }

  const missing = [...names].filter((name) => (registry.enums[name as keyof typeof registry.enums] ?? []).length < 2);
  expect(missing).toEqual([]);
});
