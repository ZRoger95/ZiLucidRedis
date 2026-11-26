import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { resolveFuzzParams } from './fuzz-params.ts';
import { buildFuzzReport, type FuzzVitestReport } from './fuzz-report.ts';

const REPORT_DIR = '.fuzz';
const JSON_PATH = path.join(REPORT_DIR, 'vitest-report.json');
const REPORT_PATH = path.join(REPORT_DIR, 'report.md');

function vitestEntry(): string {
  const nodeRequire = createRequire(import.meta.url);
  return path.join(path.dirname(nodeRequire.resolve('vitest/package.json')), 'vitest.mjs');
}

function readReport(): FuzzVitestReport | undefined {
  if (!existsSync(JSON_PATH)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(JSON_PATH, 'utf8')) as FuzzVitestReport;
  } catch (error) {
    console.warn(`Vitest JSON 报告解析失败：${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function main(): void {
  const params = resolveFuzzParams(process.env.FUZZ_MULTIPLIER || '20', process.env.FUZZ_SEED);
  const seed = params.seed ?? randomInt(2 ** 31);

  mkdirSync(REPORT_DIR, { recursive: true });

  const result = spawnSync(
    process.execPath,
    [
      vitestEntry(),
      'run',
      'property',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${JSON_PATH}`,
      `--testTimeout=${5000 * params.multiplier}`,
    ],
    {
      env: { ...process.env, FUZZ_RUNS_MULTIPLIER: String(params.multiplier), FUZZ_SEED: String(seed) },
      stdio: 'inherit',
    },
  );

  if (result.error) {
    console.error(`Vitest 启动失败：${result.error.message}`);
  }

  const markdown = buildFuzzReport({
    generatedAt: new Date().toISOString(),
    multiplier: params.multiplier,
    report: readReport(),
    seed,
  });
  writeFileSync(REPORT_PATH, markdown);

  console.log(`seed=${seed} 倍数=${params.multiplier}，报告：${REPORT_PATH}`);
  process.exitCode = result.status ?? 1;
}

main();
