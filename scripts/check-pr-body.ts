import { validatePrBody } from './lib/pr-body.ts';

const body = process.env.PR_BODY;

if (body === undefined) {
  console.error(
    '缺少 PR_BODY 环境变量。本地检查：PR_BODY="$(gh pr view <PR号> --json body --jq .body)" node --experimental-strip-types scripts/check-pr-body.ts',
  );
  process.exit(2);
}

const errors = validatePrBody(body);

if (errors.length > 0) {
  console.error('PR 正文不符合模板：');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error('按 .github/pull_request_template.md 补全后重新触发检查。');
  process.exit(1);
}

console.log('PR 正文符合模板。');
