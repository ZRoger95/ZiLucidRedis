import { describe, expect, it } from 'vitest';

import { fuzzRuns, resolveFuzzParams } from './fuzz-params';

describe('resolveFuzzParams', () => {
  it('未设置时倍数默认 1、seed 未定义', () => {
    expect(resolveFuzzParams(undefined, undefined)).toEqual({ multiplier: 1, seed: undefined });
  });

  it('空字符串按未设置处理（schedule 触发时 inputs 为空）', () => {
    expect(resolveFuzzParams('', '')).toEqual({ multiplier: 1, seed: undefined });
  });

  it('合法值原样解析', () => {
    expect(resolveFuzzParams('20', '12345')).toEqual({ multiplier: 20, seed: 12_345 });
  });

  it('seed 允许 0', () => {
    expect(resolveFuzzParams('2', '0')).toEqual({ multiplier: 2, seed: 0 });
  });

  it('倍数必须是不小于 1 的整数', () => {
    expect(() => resolveFuzzParams('0', undefined)).toThrow('FUZZ_RUNS_MULTIPLIER');
    expect(() => resolveFuzzParams('-3', undefined)).toThrow('FUZZ_RUNS_MULTIPLIER');
    expect(() => resolveFuzzParams('1.5', undefined)).toThrow('FUZZ_RUNS_MULTIPLIER');
    expect(() => resolveFuzzParams('abc', undefined)).toThrow('FUZZ_RUNS_MULTIPLIER');
  });

  it('seed 必须是非负整数', () => {
    expect(() => resolveFuzzParams(undefined, '-1')).toThrow('FUZZ_SEED');
    expect(() => resolveFuzzParams(undefined, '2.5')).toThrow('FUZZ_SEED');
    expect(() => resolveFuzzParams(undefined, 'abc')).toThrow('FUZZ_SEED');
  });
});

describe('fuzzRuns', () => {
  it('内环（env 未设置）保持原值', () => {
    expect(fuzzRuns(500)).toBe(500);
    expect(fuzzRuns(1)).toBe(1);
  });
});
