export interface FuzzAssertion {
  failureMessages: string[];
  fullName: string;
  status: string;
}

export interface FuzzFileResult {
  assertionResults: FuzzAssertion[];
  name: string;
}

export interface FuzzVitestReport {
  numFailedTests: number;
  numPassedTests: number;
  numTotalTests: number;
  testResults: FuzzFileResult[];
}

export interface FuzzReportInput {
  generatedAt: string;
  multiplier: number;
  report: FuzzVitestReport | undefined;
  seed: number;
}

function fenceFor(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function replayCommands(seed: number, multiplier: number): string[] {
  return [
    '## 重放',
    '',
    '相同 seed + 相同倍数可整体重放（fast-check 失败原文含每条性质的 path）：',
    '',
    '```bash',
    `FUZZ_SEED=${seed} FUZZ_MULTIPLIER=${multiplier} npm run fuzz`,
    '```',
    '',
    'PowerShell：',
    '',
    '```powershell',
    `$env:FUZZ_SEED='${seed}'; $env:FUZZ_MULTIPLIER='${multiplier}'; npm run fuzz`,
    '```',
  ];
}

export function buildFuzzReport({ generatedAt, multiplier, report, seed }: FuzzReportInput): string {
  const lines = ['# 外环模糊测试报告', '', `- 时间: ${generatedAt}`, `- seed: ${seed}`, `- 轮数倍数: ${multiplier}`];

  if (!report) {
    lines.push('- 结果: Vitest JSON 报告缺失（运行可能崩溃），详见运行日志', '', ...replayCommands(seed, multiplier));
    return `${lines.join('\n')}\n`;
  }

  const passed = report.numPassedTests;
  const total = report.numTotalTests;
  const failed = report.numFailedTests;
  lines.push(
    failed > 0 ? `- 结果: ❌ ${failed} 条失败（${passed}/${total} 通过）` : `- 结果: ✅ 全部通过（${passed}/${total}）`,
    '',
    ...replayCommands(seed, multiplier),
  );

  const failures = report.testResults.flatMap((file) =>
    file.assertionResults
      .filter((assertion) => assertion.status === 'failed')
      .map((assertion) => ({ file: file.name, ...assertion })),
  );

  if (failures.length > 0) {
    lines.push('', '## 失败明细');
    for (const failure of failures) {
      const message = failure.failureMessages.join('\n\n') || '（无失败信息，详见运行日志）';
      const fence = fenceFor(message);
      lines.push('', `### ${failure.file} > ${failure.fullName}`, '', fence, message, fence);
    }
  }

  return `${lines.join('\n')}\n`;
}
