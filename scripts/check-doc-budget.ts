import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOC_BUDGETS = {
  'AGENTS.md': 4_550,
} as const;

export interface DocBudgetMeasurement {
  chars: number;
  limit: number;
  overBy: number;
}

export function countBudgetChars(source: string): number {
  return [...source].filter((char) => !/\s/u.test(char)).length;
}

export function measureDocBudget(source: string, limit: number): DocBudgetMeasurement {
  const chars = countBudgetChars(source);
  return { chars, limit, overBy: Math.max(0, chars - limit) };
}

function main(): void {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const failures: string[] = [];
  for (const [path, limit] of Object.entries(DOC_BUDGETS)) {
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) {
      failures.push(`${path}: 预算文件不存在（改名或删除时同步更新 DOC_BUDGETS）`);
      continue;
    }
    const { chars, overBy } = measureDocBudget(readFileSync(absolute, 'utf8'), limit);
    console.log(`${path}: ${chars} / ${limit} 非空白字符`);
    if (overBy > 0) {
      failures.push(`${path}: 超出上限 ${overBy} 个非空白字符（${chars} / ${limit}）`);
    }
  }
  if (failures.length > 0) {
    console.error('文档体量超出预算：');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    console.error(
      '先改现有条目、删减或迁移细节；确需上调时在 PR 备注说明理由，并同步修改 scripts/check-doc-budget.ts 的 DOC_BUDGETS。',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
