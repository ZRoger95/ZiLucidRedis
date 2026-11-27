import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  type CheckBucket,
  type CheckEntry,
  parseArgs,
  type PrCommit,
  squashBody,
  squashSubject,
  summarizeChecks,
} from './lib/pr-merge.ts';

export { parseArgs, squashBody, squashSubject, summarizeChecks } from './lib/pr-merge.ts';
export type { CheckBucket, CheckEntry, PrCommit } from './lib/pr-merge.ts';

export interface GhResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type GhRunner = (args: string[]) => GhResult;

export interface RunOptions {
  gh: GhRunner;
  log: (line: string) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  pollIntervalMs: number;
  timeoutMs: number;
}

interface ViewPayload {
  state: string;
  title: string;
  baseRefName: string;
  statusCheckRollup: CheckEntry[] | null;
  commits: PrCommit[] | null;
}

const USAGE = '用法：npm run pr:merge -- <PR号>';
const MIN_GH_VERSION = [2, 20, 0] as const;
const VIEW_FIELDS = 'state,title,baseRefName,statusCheckRollup,commits';

function compareVersion(current: readonly number[], minimum: readonly number[]): number {
  for (let index = 0; index < minimum.length; index += 1) {
    const left = current[index] ?? 0;
    const right = minimum[index] ?? 0;
    if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function readChecks(value: unknown): CheckEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      return {};
    }
    const conclusion = entry.conclusion;
    const state = entry.state;
    return {
      conclusion: typeof conclusion === 'string' || conclusion === null ? conclusion : undefined,
      state: typeof state === 'string' || state === null ? state : undefined,
    };
  });
}

function readCommits(value: unknown): PrCommit[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.map((entry) => ({
    headline: isRecord(entry) && typeof entry.messageHeadline === 'string' ? entry.messageHeadline : '',
  }));
}

function asViewPayload(text: string): ViewPayload | null {
  const parsed = parseJson(text);
  if (!isRecord(parsed)) {
    return null;
  }
  return {
    baseRefName: readString(parsed, 'baseRefName'),
    commits: readCommits(parsed.commits),
    state: readString(parsed, 'state'),
    statusCheckRollup: readChecks(parsed.statusCheckRollup),
    title: readString(parsed, 'title'),
  };
}

function bucketLabel(bucket: CheckBucket): string {
  if (bucket === 'pass') {
    return '全部通过';
  }
  return bucket === 'fail' ? '有检查未通过' : '仍在运行';
}

export async function runPrMerge(argv: readonly string[], options: RunOptions): Promise<number> {
  const { gh, log, now, sleep, pollIntervalMs, timeoutMs } = options;

  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    log(parsed.error);
    log(USAGE);
    return 1;
  }
  const prNumber = parsed.prNumber;

  const version = gh(['--version']);
  if (version.status !== 0) {
    log('无法执行 gh，请确认已安装 GitHub CLI');
    return 1;
  }
  const versionMatch = /gh version (\d+)\.(\d+)\.(\d+)/.exec(version.stdout);
  if (versionMatch === null) {
    log('无法解析 gh 版本，请升级 GitHub CLI');
    return 1;
  }
  const currentVersion = [Number(versionMatch[1]), Number(versionMatch[2]), Number(versionMatch[3])];
  if (compareVersion(currentVersion, MIN_GH_VERSION) < 0) {
    log(
      `gh 版本过低：需要 ≥ ${MIN_GH_VERSION.join('.')}，当前 ${versionMatch[1]}.${versionMatch[2]}.${versionMatch[3]}`,
    );
    return 1;
  }

  const auth = gh(['auth', 'status']);
  if (auth.status !== 0) {
    log('未登录 GitHub CLI，请先执行 gh auth login');
    return 1;
  }

  const fetchView = (fields: string): GhResult => gh(['pr', 'view', String(prNumber), '--json', fields]);

  const first = fetchView(VIEW_FIELDS);
  if (first.status !== 0) {
    log(first.stderr.trim() === '' ? `读取 PR #${prNumber} 失败` : first.stderr.trim());
    return 1;
  }
  const initial = asViewPayload(first.stdout);
  if (initial === null) {
    log(`无法解析 PR #${prNumber} 的响应`);
    return 1;
  }

  if (initial.state === 'MERGED') {
    log(`PR #${prNumber} 已是 MERGED，无需操作`);
    return 0;
  }
  if (initial.state !== 'OPEN') {
    log(`PR #${prNumber} 状态为 ${initial.state}，不合并`);
    return 1;
  }
  if (initial.baseRefName !== 'master') {
    log(`PR #${prNumber} 的目标分支是 ${initial.baseRefName}，本脚本只合并到 master`);
    return 1;
  }

  log(`PR #${prNumber}  ${initial.title}`);

  let rollup = initial.statusCheckRollup;
  let bucket = summarizeChecks(rollup);
  log(`检查状态：${bucketLabel(bucket)}`);
  const deadline = now() + timeoutMs;
  while (bucket === 'pending') {
    if (now() >= deadline) {
      log(`等待检查超过 ${Math.round(timeoutMs / 60000)} 分钟，已中止，PR 保持 OPEN`);
      return 1;
    }
    await sleep(pollIntervalMs);
    const again = fetchView('statusCheckRollup');
    if (again.status !== 0) {
      log(again.stderr.trim() === '' ? '读取检查状态失败' : again.stderr.trim());
      return 1;
    }
    const next = asViewPayload(again.stdout);
    rollup = next === null ? null : next.statusCheckRollup;
    const nextBucket = summarizeChecks(rollup);
    if (nextBucket !== bucket) {
      log(`检查状态：${bucketLabel(nextBucket)}`);
    }
    bucket = nextBucket;
  }

  if (bucket === 'fail') {
    log('有检查未通过，已中止，PR 保持 OPEN，未合并');
    return 1;
  }

  const subject = squashSubject(initial.title, prNumber);
  const body = squashBody(initial.commits ?? []);
  log(`合并标题：${subject}`);
  const merged = gh(['pr', 'merge', String(prNumber), '--squash', '--subject', subject, '--body', body]);
  if (merged.status !== 0) {
    log(merged.stderr.trim() === '' ? '合并失败' : merged.stderr.trim());
    return 1;
  }

  const done = gh(['pr', 'view', String(prNumber), '--json', 'mergeCommit', '--jq', '.mergeCommit.oid']);
  const oid = done.status === 0 ? done.stdout.trim() : '';
  log(oid === '' ? `已合并 PR #${prNumber}` : `已合并 PR #${prNumber}：${oid}`);
  log('后续：git switch master && git pull --ff-only');
  return 0;
}

function defaultRunner(args: string[]): GhResult {
  const result = spawnSync('gh', args, { encoding: 'utf8', shell: false });
  return { stderr: result.stderr ?? '', status: result.status ?? 1, stdout: result.stdout ?? '' };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const code = await runPrMerge(process.argv.slice(2), {
    gh: defaultRunner,
    log: (line) => console.log(line),
    now: () => Date.now(),
    pollIntervalMs: 15000,
    sleep: defaultSleep,
    timeoutMs: 15 * 60 * 1000,
  });
  process.exitCode = code;
}
