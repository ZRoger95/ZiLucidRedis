export interface PrCommit {
  headline: string;
}

export interface CheckEntry {
  conclusion?: string | null;
  state?: string | null;
}

export type CheckBucket = 'pass' | 'fail' | 'pending';

export type ParseArgsResult = { ok: true; prNumber: number } | { ok: false; error: string };

const PR_NUMBER_RE = /^[1-9]\d*$/;

const PASS_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const PASS_STATES = new Set(['SUCCESS']);
const FAIL_STATES = new Set(['ERROR', 'FAILURE']);

export function squashSubject(title: string, prNumber: number): string {
  const trimmed = title.trim();
  const suffix = `(#${prNumber})`;
  if (trimmed.endsWith(suffix)) {
    return trimmed;
  }
  return `${trimmed} ${suffix}`;
}

export function squashBody(commits: readonly PrCommit[]): string {
  return commits.map((commit) => `* ${commit.headline}`).join('\n');
}

export function parseArgs(argv: readonly string[]): ParseArgsResult {
  const [raw, ...rest] = argv;
  if (raw === undefined) {
    return { error: '缺少 PR 号', ok: false };
  }
  if (rest.length > 0) {
    return { error: `未识别参数：${rest.join(' ')}`, ok: false };
  }
  if (!PR_NUMBER_RE.test(raw)) {
    return { error: `PR 号必须是正整数：${raw}`, ok: false };
  }
  return { ok: true, prNumber: Number(raw) };
}

function bucketOf(entry: CheckEntry): CheckBucket {
  if (entry.conclusion !== undefined) {
    if (entry.conclusion === null) {
      return 'pending';
    }
    return PASS_CONCLUSIONS.has(entry.conclusion) ? 'pass' : 'fail';
  }
  if (entry.state === undefined || entry.state === null) {
    return 'pending';
  }
  if (PASS_STATES.has(entry.state)) {
    return 'pass';
  }
  return FAIL_STATES.has(entry.state) ? 'fail' : 'pending';
}

export function summarizeChecks(rollup: readonly CheckEntry[] | null | undefined): CheckBucket {
  if (rollup === null || rollup === undefined || rollup.length === 0) {
    return 'pending';
  }
  let settled = true;
  for (const entry of rollup) {
    const bucket = bucketOf(entry);
    if (bucket === 'fail') {
      return 'fail';
    }
    if (bucket === 'pending') {
      settled = false;
    }
  }
  return settled ? 'pass' : 'pending';
}
