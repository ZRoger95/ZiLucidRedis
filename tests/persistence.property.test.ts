import fc from 'fast-check';
import { beforeEach, expect, test } from 'vitest';

import type { PersistedState } from '../src/types';

import { loadState, saveState, STORAGE_KEY } from '../src/lib/persistence';
import { replaceSecrets } from '../src/lib/secrets';
import { confWithSecretsArb } from './arbitraries';
import { fuzzRuns } from './fuzz-params';

beforeEach(() => localStorage.clear());

function stateFor(text: string): PersistedState {
  return {
    annotationMode: 'missing',
    bottomCollapsed: false,
    line: '7.4',
    onlyDiff: false,
    showZh: true,
    text,
    v: 1,
  };
}

test('replaceSecrets 的输出总能通过持久化守卫', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ text }) => {
      expect(() => saveState(stateFor(replaceSecrets(text).text))).not.toThrow();
    }),
    { numRuns: fuzzRuns(300) },
  );
});

test('持久化产物不含任何植入明文', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ planted, text }) => {
      saveState(stateFor(replaceSecrets(text).text));
      const stored = loadState();
      const raw = localStorage.getItem(STORAGE_KEY) ?? '';
      for (const secret of planted) {
        expect(stored?.text ?? '').not.toContain(secret);
        if (!secret.includes('"') && !secret.includes('\\')) {
          expect(raw).not.toContain(secret);
        }
      }
    }),
    { numRuns: fuzzRuns(300) },
  );
});

test('持久化往返保持文本不变', () => {
  fc.assert(
    fc.property(confWithSecretsArb, ({ text }) => {
      const safe = replaceSecrets(text).text;
      saveState(stateFor(safe));
      expect(loadState()?.text).toBe(safe);
    }),
    { numRuns: fuzzRuns(200) },
  );
});

test('引号包裹的占位符不被守卫误判为明文', () => {
  expect(() => saveState(stateFor('requirepass "${env_requirepass}"\n'))).not.toThrow();
  expect(() => saveState(stateFor('user guest on >"${env_user-pass}" ~*\n'))).not.toThrow();
});
