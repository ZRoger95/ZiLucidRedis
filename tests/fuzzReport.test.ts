import { describe, expect, it } from 'vitest';

import { buildFuzzReport, type FuzzVitestReport } from '../scripts/fuzz-report';

const baseInput = {
  generatedAt: '2026-11-25T03:00:00.000Z',
  multiplier: 20,
  seed: 12_345,
};

function reportWith(failed: boolean): FuzzVitestReport {
  return {
    numFailedTests: failed ? 1 : 0,
    numPassedTests: failed ? 1 : 2,
    numTotalTests: 2,
    testResults: [
      {
        assertionResults: [
          {
            failureMessages: failed
              ? [
                  'Property failed after 37 tests\n{ seed: 12345, path: "36:2:1" }\nCounterexample: [{"planted":["Abc12345"],"text":"requirepass Abc12345\\n"}]\nShrunk 4 time(s)',
                ]
              : [],
            fullName: '输出不含任何植入明文，也不含 vault 中的真实密码',
            status: failed ? 'failed' : 'passed',
          },
          { failureMessages: [], fullName: '幂等：对输出再次替换不会发现新密码', status: 'passed' },
        ],
        name: 'tests/secrets.property.test.ts',
      },
    ],
  };
}

describe('buildFuzzReport', () => {
  it('成功报告含 seed、倍数、统计与重放命令', () => {
    const markdown = buildFuzzReport({ ...baseInput, report: reportWith(false) });
    expect(markdown).toContain('seed: 12345');
    expect(markdown).toContain('轮数倍数: 20');
    expect(markdown).toContain('2/2');
    expect(markdown).toContain('FUZZ_SEED=12345 FUZZ_MULTIPLIER=20 npm run fuzz');
    expect(markdown).toContain("$env:FUZZ_SEED='12345'");
    expect(markdown).not.toContain('失败明细');
  });

  it('失败报告含违反的不变量与 fast-check 失败原文（收缩反例）', () => {
    const markdown = buildFuzzReport({ ...baseInput, report: reportWith(true) });
    expect(markdown).toContain('1/2');
    expect(markdown).toContain('失败明细');
    expect(markdown).toContain('tests/secrets.property.test.ts > 输出不含任何植入明文');
    expect(markdown).toContain('Counterexample:');
    expect(markdown).toContain('Shrunk 4 time(s)');
    expect(markdown).toContain('FUZZ_SEED=12345 FUZZ_MULTIPLIER=20 npm run fuzz');
  });

  it('JSON 报告缺失时仍记录 seed 并说明原因', () => {
    const markdown = buildFuzzReport({ ...baseInput, report: undefined });
    expect(markdown).toContain('seed: 12345');
    expect(markdown).toContain('缺失');
    expect(markdown).toContain('FUZZ_SEED=12345');
  });

  it('失败原文含代码围栏时升级围栏避免截断', () => {
    const report = reportWith(true);
    report.testResults[0].assertionResults[0].failureMessages = ['Counterexample: ["```"]'];
    const markdown = buildFuzzReport({ ...baseInput, report });
    expect(markdown).toContain('````');
    expect(markdown).toContain('Counterexample: ["```"]');
  });
});
