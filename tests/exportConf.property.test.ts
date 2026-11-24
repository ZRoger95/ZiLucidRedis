import fc from 'fast-check';
import { expect, test } from 'vitest';

import { exportOriginal, exportWithSecrets } from '../src/lib/exportConf';
import { parseConf } from '../src/lib/parseConf';
import { replaceSecrets } from '../src/lib/secrets';
import { confWithSecretsArb, mutatedConfArb } from './arbitraries';

const anyTextArb = fc.oneof(
  fc.string(),
  mutatedConfArb,
  confWithSecretsArb.map((conf) => conf.text),
);

function semanticShape(text: string): string {
  return JSON.stringify(
    parseConf(text)
      .filter((line) => line.kind !== 'blank')
      .map((line) => ({ args: line.args ?? [], kind: line.kind, name: line.name ?? null })),
  );
}

test('exportOriginal 幂等', () => {
  fc.assert(
    fc.property(anyTextArb, (text) => {
      expect(exportOriginal(exportOriginal(text))).toBe(exportOriginal(text));
    }),
    { numRuns: 200 },
  );
});

test('exportOriginal 输出无 CR、无尾部空行、以单个换行结尾', () => {
  fc.assert(
    fc.property(anyTextArb, (text) => {
      const output = exportOriginal(text);
      expect(output).not.toContain('\r');
      expect(output.endsWith('\n')).toBe(true);
      expect(output.endsWith('\n\n')).toBe(false);
    }),
    { numRuns: 200 },
  );
});

test('exportWithSecrets 能语义还原替换后的文本', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ text }) => {
      const result = replaceSecrets(text);
      expect(semanticShape(exportWithSecrets(result.text, result.vault))).toBe(semanticShape(text));
    }),
    { numRuns: 300 },
  );
});
