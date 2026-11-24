import fc from 'fast-check';
import { expect, test } from 'vitest';

import { parseConf } from '../src/lib/parseConf';
import { hasPlaceholder, replaceSecrets, restoreSecrets } from '../src/lib/secrets';
import { canonicalConfArb, confWithSecretsArb, secretBodyArb } from './arbitraries';

const SENSITIVE_NAMES = ['masterauth', 'requirepass', 'tls-client-key-file-pass', 'tls-key-file-pass'];

function semanticShape(text: string): string {
  return JSON.stringify(
    parseConf(text).map((line) => ({ args: line.args ?? [], kind: line.kind, name: line.name ?? null })),
  );
}

test('输出不含任何植入明文，也不含 vault 中的真实密码', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ planted, text }) => {
      const result = replaceSecrets(text);
      const secrets = [...planted, ...[...result.vault.values()].filter((value) => !hasPlaceholder(value))];
      for (const secret of secrets) {
        expect(result.text).not.toContain(secret);
      }
    }),
    { numRuns: 500 },
  );
});

test('幂等：对输出再次替换不会发现新密码', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ text }) => {
      expect(replaceSecrets(replaceSecrets(text).text).found).toBe(0);
    }),
    { numRuns: 200 },
  );
});

test('发现密码时输出必含占位符', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ text }) => {
      const result = replaceSecrets(text);
      if (result.found > 0) {
        expect(hasPlaceholder(result.text)).toBe(true);
      }
    }),
    { numRuns: 200 },
  );
});

test('规范形态输入满足字节级往返', () => {
  fc.assert(
    fc.property(canonicalConfArb, ({ text }) => {
      const result = replaceSecrets(text);
      expect(restoreSecrets(result.text, result.vault)).toBe(text);
    }),
    { numRuns: 500 },
  );
});

test('任意形态输入满足语义级往返', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ text }) => {
      const result = replaceSecrets(text);
      expect(semanticShape(restoreSecrets(result.text, result.vault))).toBe(semanticShape(text));
    }),
    { numRuns: 300 },
  );
});

test('字面占位符与真实密码混排时还原不错位', () => {
  fc.assert(
    fc.property(fc.constantFrom(...SENSITIVE_NAMES), secretBodyArb, (name, secret) => {
      const input = `${name} \${env_${name}}\n${name} ${secret}\n`;
      const result = replaceSecrets(input);
      expect(result.found).toBe(1);
      expect(restoreSecrets(result.text, result.vault)).toBe(input);
    }),
    { numRuns: 100 },
  );
});
