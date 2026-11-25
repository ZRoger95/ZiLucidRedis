import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

import { normalizeConfig } from '../src/lib/normalizeConf';
import { indexOfficialLines } from '../src/lib/official';
import { parseConf } from '../src/lib/parseConf';
import { confWithSecretsArb, mutatedConfArb } from './arbitraries';
import { fuzzRuns } from './fuzz-params';

const officialText = readFileSync(path.resolve(process.cwd(), 'src/data/official/7.4.conf'), 'utf8');

const knownNames = new Set(
  parseConf(officialText).flatMap((line) => (line.kind === 'directive' && line.name ? [line.name] : [])),
);

const officialIndex = indexOfficialLines(officialText, knownNames);

const anyTextArb = fc.oneof(
  fc.string(),
  mutatedConfArb,
  confWithSecretsArb.map((conf) => conf.text),
);

test('normalizeConfig 幂等且第二遍不再丢注释', () => {
  fc.assert(
    fc.property(anyTextArb, (text) => {
      const once = normalizeConfig(text, officialIndex);
      const twice = normalizeConfig(once.text, officialIndex);
      expect(twice.text).toBe(once.text);
      expect(twice.droppedComments).toBe(0);
      expect(twice.kept).toBe(once.kept);
      expect(twice.unknown).toEqual(once.unknown);
    }),
    { numRuns: fuzzRuns(150) },
  );
});
