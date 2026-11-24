import fc from 'fast-check';
import { expect, test } from 'vitest';

import { parseConf } from '../src/lib/parseConf';
import { mutatedConfArb } from './arbitraries';

const anyTextArb = fc.oneof(
  { arbitrary: fc.string({ unit: 'binary' }), weight: 2 },
  { arbitrary: fc.string(), weight: 2 },
  { arbitrary: mutatedConfArb, weight: 1 },
);

test('任意字符串与官方 conf 变异输入都不抛异常', () => {
  fc.assert(
    fc.property(anyTextArb, (text) => {
      expect(() => parseConf(text)).not.toThrow();
    }),
    { numRuns: 300 },
  );
});

test('行号从 1 连续递增', () => {
  fc.assert(
    fc.property(anyTextArb, (text) => {
      const lines = parseConf(text);
      lines.forEach((line, index) => {
        expect(line.lineNo).toBe(index + 1);
      });
    }),
    { numRuns: 200 },
  );
});

test('解析结果的 raw 不含换行符', () => {
  fc.assert(
    fc.property(anyTextArb, (text) => {
      for (const line of parseConf(text)) {
        expect(line.raw).not.toMatch(/[\r\n]/);
      }
    }),
    { numRuns: 200 },
  );
});

test('directive 行的参数与引号风格一一对应', () => {
  fc.assert(
    fc.property(anyTextArb, (text) => {
      for (const line of parseConf(text)) {
        if (line.kind === 'directive') {
          expect(line.args?.length).toBe(line.quoteStyles?.length);
          expect(line.name).toMatch(/^[A-Za-z][A-Za-z0-9-]*$/);
        }
      }
    }),
    { numRuns: 200 },
  );
});
