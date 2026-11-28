import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { parseArgs } from './lib/pr-merge.ts';

export { parseArgs } from './lib/pr-merge.ts';

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

interface PrView {
  baseRefName: string;
  mergeOid: string;
  state: string;
}

const USAGE = '用法：npm run pr:merge -- <PR号>';
const MIN_GH_VERSION = [2, 20, 0] as const;
const VIEW_FIELDS = 'state,baseRefName,mergeCommit';

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

function asPrView(text: string): PrView | null {
  const parsed = parseJson(text);
  if (!isRecord(parsed)) {
    return null;
  }
  const mergeCommit = parsed.mergeCommit;
  return {
    baseRefName: readString(parsed, 'baseRefName'),
    mergeOid: isRecord(mergeCommit) ? readString(mergeCommit, 'oid') : '',
    state: readString(parsed, 'state'),
  };
}

function mergedLine(prNumber: number, oid: string): string {
  return oid === '' ? `已合并 PR #${prNumber}` : `已合并 PR #${prNumber}：${oid}`;
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

  const view = (): GhResult => gh(['pr', 'view', String(prNumber), '--json', VIEW_FIELDS]);

  const first = view();
  if (first.status !== 0) {
    log(first.stderr.trim() === '' ? `读取 PR #${prNumber} 失败` : first.stderr.trim());
    return 1;
  }
  const initial = asPrView(first.stdout);
  if (initial === null) {
    log(`无法解析 PR #${prNumber} 的响应`);
    return 1;
  }

  if (initial.state === 'MERGED') {
    log(mergedLine(prNumber, initial.mergeOid));
    log('后续：git switch master && git pull --ff-only');
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

  const merged = gh(['pr', 'merge', String(prNumber), '--squash', '--auto']);
  if (merged.status !== 0) {
    log(merged.stderr.trim() === '' ? '启用自动合并失败' : merged.stderr.trim());
    return 1;
  }
  log('已启用自动合并，等待检查通过与 GitHub 完成合并…');

  let current = initial;
  const deadline = now() + timeoutMs;
  while (current.state === 'OPEN') {
    if (now() >= deadline) {
      log(
        `等待超过 ${Math.round(timeoutMs / 60000)} 分钟，PR 仍为 OPEN；自动合并保持启用，检查通过后会继续，失败则修复后再推`,
      );
      return 1;
    }
    await sleep(pollIntervalMs);
    const next = view();
    if (next.status !== 0) {
      log(next.stderr.trim() === '' ? '读取 PR 状态失败' : next.stderr.trim());
      return 1;
    }
    const nextView = asPrView(next.stdout);
    if (nextView === null) {
      log(`无法解析 PR #${prNumber} 的响应`);
      return 1;
    }
    current = nextView;
  }

  if (current.state === 'MERGED') {
    log(mergedLine(prNumber, current.mergeOid));
    log('后续：git switch master && git pull --ff-only');
    return 0;
  }
  log(`PR #${prNumber} 状态为 ${current.state}，未合并`);
  return 1;
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
