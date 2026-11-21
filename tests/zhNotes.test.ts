import { expect, test } from 'vitest';

import zhNotes from '../src/data/zh-notes.json';
import { loadDict, VERSIONS } from '../src/lib/dict';

test('每个版本的每条字典指令都有非空中文摘要', async () => {
  const notes = zhNotes as Record<string, string>;
  const missing: string[] = [];
  for (const line of VERSIONS) {
    const dict = await loadDict(line);
    for (const doc of dict.directives) {
      if (!notes[doc.name]?.trim()) {
        missing.push(`${line}:${doc.name}`);
      }
    }
  }
  expect(missing).toEqual([]);
});
