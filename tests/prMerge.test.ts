import { describe, expect, test } from 'vitest';

import {
  type GhRunner,
  parseArgs,
  type PrCommit,
  runPrMerge,
  squashBody,
  squashSubject,
  summarizeChecks,
} from '../scripts/pr-merge';

const commit = (headline: string): PrCommit => ({ headline });

function fakeGh(responses: Record<string, string>): { calls: string[][]; gh: GhRunner } {
  const calls: string[][] = [];
  const gh: GhRunner = (args) => {
    calls.push(args);
    const key = args[0] === '--version' ? 'version' : args.slice(0, 3).join(' ');
    const stdout = responses[key];
    if (stdout === undefined) {
      return { status: 1, stderr: `unexpected gh call: ${args.join(' ')}`, stdout: '' };
    }
    return { status: 0, stderr: '', stdout };
  };
  return { calls, gh };
}

const VERSION_OK = JSON.stringify('gh version 2.106.0 (2025-10-01)');
const AUTH_OK = 'Logged in to github.com account ZRoger95';

function viewPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    state: 'OPEN',
    title: 'feat: x',
    baseRefName: 'master',
    statusCheckRollup: [{ conclusion: 'SUCCESS', __typename: 'CheckRun' }],
    commits: [{ messageHeadline: 'feat: x' }],
    ...overrides,
  });
}

function run(argv: string[], gh: GhRunner, overrides: Record<string, unknown> = {}) {
  const logs: string[] = [];
  const promise = runPrMerge(argv, {
    gh,
    log: (line) => logs.push(line),
    now: () => 0,
    pollIntervalMs: 1,
    sleep: () => Promise.resolve(),
    timeoutMs: 1000,
    ...overrides,
  });
  return { logs, promise };
}

describe('squashSubject', () => {
  test('追加 PR 编号', () => {
    expect(squashSubject('feat: x', 6)).toBe('feat: x (#6)');
  });

  test('已带同一编号时不重复', () => {
    expect(squashSubject('feat: x (#6)', 6)).toBe('feat: x (#6)');
  });

  test('标题里其他编号引用原样保留', () => {
    expect(squashSubject('feat: x (#12)', 6)).toBe('feat: x (#12) (#6)');
  });

  test('引号、括号、中文、emoji 原样保留', () => {
    const title = `fix: 处理 "引号" (括号) 与 🎯`;
    expect(squashSubject(title, 6)).toBe(`${title} (#6)`);
  });
});

describe('squashBody', () => {
  test('按提交顺序拼成列表', () => {
    expect(squashBody([commit('feat: a'), commit('test: b')])).toBe('* feat: a\n* test: b');
  });

  test('空列表为空串', () => {
    expect(squashBody([])).toBe('');
  });
});

describe('parseArgs', () => {
  test('缺省 PR 号报错', () => {
    expect(parseArgs([])).toEqual({ ok: false, error: '缺少 PR 号' });
  });

  test('非正整数报错', () => {
    expect(parseArgs(['abc'])).toEqual({ ok: false, error: 'PR 号必须是正整数：abc' });
    expect(parseArgs(['0'])).toEqual({ ok: false, error: 'PR 号必须是正整数：0' });
    expect(parseArgs(['-3'])).toEqual({ ok: false, error: 'PR 号必须是正整数：-3' });
  });

  test('多余参数一律视为未识别', () => {
    expect(parseArgs(['6', '--now'])).toEqual({ ok: false, error: '未识别参数：--now' });
    expect(parseArgs(['6', '--delete-branch'])).toEqual({ ok: false, error: '未识别参数：--delete-branch' });
  });

  test('合法输入返回 PR 号', () => {
    expect(parseArgs(['6'])).toEqual({ ok: true, prNumber: 6 });
  });
});

describe('summarizeChecks', () => {
  test('CheckRun 全部成功为 pass', () => {
    expect(summarizeChecks([{ conclusion: 'SUCCESS' }, { conclusion: 'SKIPPED' }])).toBe('pass');
  });

  test('CheckRun 失败为 fail', () => {
    expect(summarizeChecks([{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }])).toBe('fail');
  });

  test('CheckRun 未完成为 pending', () => {
    expect(summarizeChecks([{ conclusion: null }])).toBe('pending');
  });

  test('StatusContext 按 state 归约', () => {
    expect(summarizeChecks([{ state: 'SUCCESS' }])).toBe('pass');
    expect(summarizeChecks([{ state: 'ERROR' }])).toBe('fail');
    expect(summarizeChecks([{ state: 'PENDING' }])).toBe('pending');
    expect(summarizeChecks([{ state: 'EXPECTED' }])).toBe('pending');
  });

  test('空列表视为 pending', () => {
    expect(summarizeChecks([])).toBe('pending');
    expect(summarizeChecks(null)).toBe('pending');
  });
});

describe('runPrMerge', () => {
  test('缺参数直接退出 1 且不调用 gh', async () => {
    const { calls, gh } = fakeGh({});
    const { logs, promise } = run([], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls).toHaveLength(0);
    expect(logs.join('\n')).toContain('用法');
  });

  test('未识别参数退出 1 且不调用 gh', async () => {
    const { calls, gh } = fakeGh({});
    const { promise, logs } = run(['6', '--now'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls).toHaveLength(0);
    expect(logs.join('\n')).toContain('未识别参数');
  });

  test('gh 版本过低退出 1 且不合并', async () => {
    const { calls, gh } = fakeGh({ 'pr view 6': viewPayload(), version: 'gh version 2.10.0 (2023-01-01)' });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls.some((args) => args[1] === 'merge')).toBe(false);
    expect(logs.join('\n')).toContain('版本');
  });

  test('未登录退出 1 且不合并', async () => {
    const { gh, calls } = fakeGh({ 'pr view 6': viewPayload(), version: VERSION_OK });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
    expect(logs.join('\n')).toContain('gh auth login');
  });

  test('PR 已合并退出 0 且不重复合并', async () => {
    const { gh, calls } = fakeGh({
      'pr view 6': viewPayload({ state: 'MERGED' }),
      version: VERSION_OK,
      'auth status': AUTH_OK,
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(0);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
    expect(logs.join('\n')).toContain('无需操作');
  });

  test('base 非 master 退出 1 且不合并', async () => {
    const { gh, calls } = fakeGh({
      'pr view 6': viewPayload({ baseRefName: 'develop' }),
      version: VERSION_OK,
      'auth status': AUTH_OK,
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
    expect(logs.join('\n')).toContain('master');
  });

  test('检查失败退出 1 且不合并', async () => {
    const { gh, calls } = fakeGh({
      'pr view 6': viewPayload({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }),
      version: VERSION_OK,
      'auth status': AUTH_OK,
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
    expect(logs.join('\n')).toContain('检查');
  });

  test('检查一直未完成则超时退出 1 且不合并', async () => {
    const { gh, calls } = fakeGh({
      'pr view 6': viewPayload({ statusCheckRollup: [{ conclusion: null }] }),
      version: VERSION_OK,
      'auth status': AUTH_OK,
    });
    let clock = 0;
    const { promise } = run(['6'], gh, {
      now: () => {
        clock += 600000;
        return clock;
      },
    });
    await expect(promise).resolves.toBe(1);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
  });

  test('检查通过后按 squash 合并并带标题与正文', async () => {
    const { gh, calls } = fakeGh({
      'pr view 6': viewPayload(),
      version: VERSION_OK,
      'auth status': AUTH_OK,
      'pr merge 6': '',
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(0);
    const mergeCall = calls.find((args) => args.includes('merge'));
    expect(mergeCall).toBeDefined();
    expect(mergeCall).toEqual(['pr', 'merge', '6', '--squash', '--subject', 'feat: x (#6)', '--body', '* feat: x']);
    expect(logs.join('\n')).toContain('feat: x (#6)');
  });

  test('特殊字符标题原样进入参数数组', async () => {
    const title = `fix: 处理 "引号" (括号) 与 🎯`;
    const { gh, calls } = fakeGh({
      'pr view 6': viewPayload({ title, commits: [{ messageHeadline: title }] }),
      version: VERSION_OK,
      'auth status': AUTH_OK,
      'pr merge 6': '',
    });
    const { promise } = run(['6'], gh);
    await expect(promise).resolves.toBe(0);
    const mergeCall = calls.find((args) => args.includes('merge')) ?? [];
    expect(mergeCall[mergeCall.indexOf('--subject') + 1]).toBe(`${title} (#6)`);
    expect(mergeCall[mergeCall.indexOf('--body') + 1]).toBe(`* ${title}`);
  });
});
