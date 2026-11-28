import { describe, expect, test } from 'vitest';

import { countBudgetChars, DOC_BUDGETS, measureDocBudget } from '../scripts/check-doc-budget';

describe('countBudgetChars', () => {
  test('忽略空白与表格对齐空格', () => {
    expect(countBudgetChars('|a   |b|')).toBe(5);
    expect(countBudgetChars('|a|b|')).toBe(5);
    expect(countBudgetChars('a b\n中 文')).toBe(4);
  });

  test('按 code point 计数', () => {
    expect(countBudgetChars('🙂')).toBe(1);
  });
});

describe('measureDocBudget', () => {
  test('未超限时 overBy 为 0', () => {
    expect(measureDocBudget('a b', 2)).toEqual({ chars: 2, limit: 2, overBy: 0 });
  });

  test('超限时给出超出量', () => {
    expect(measureDocBudget('abc', 2)).toEqual({ chars: 3, limit: 2, overBy: 1 });
  });
});

test('预算表为正整数', () => {
  for (const limit of Object.values(DOC_BUDGETS)) {
    expect(Number.isInteger(limit)).toBe(true);
    expect(limit).toBeGreaterThan(0);
  }
});
