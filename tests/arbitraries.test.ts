import fc from 'fast-check';
import { expect, test } from 'vitest';

import { canonicalConfArb, confWithSecretsArb, mutatedConfArb } from './arbitraries';

test('植入的明文都真实出现在生成文本中', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ planted, text }) => {
      expect(planted.length).toBeGreaterThan(0);
      for (const secret of planted) {
        expect(text).toContain(secret);
      }
    }),
  );
});

test('生成文本至少含一条敏感指令', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ text }) => {
      expect(text).toMatch(/^\s*(masterauth|requirepass|tls-client-key-file-pass|tls-key-file-pass|user)\b/m);
    }),
  );
});

test('规范形态生成器产出单空格 LF 且以换行结尾的文本', () => {
  fc.assert(
    fc.property(canonicalConfArb, ({ text }) => {
      expect(text.endsWith('\n')).toBe(true);
      expect(text).not.toContain('\r');
      expect(text).not.toContain('\t');
    }),
  );
});

test('官方 conf 变异生成器始终产出字符串', () => {
  fc.assert(
    fc.property(mutatedConfArb, (text) => {
      expect(typeof text).toBe('string');
    }),
    { numRuns: 20 },
  );
});
