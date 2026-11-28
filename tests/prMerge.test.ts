import { describe, expect, test } from 'vitest';

import { type GhRunner, parseArgs, runPrMerge } from '../scripts/pr-merge';

type FakeResponse = { status?: number; stderr?: string; stdout?: string } | string;

function fakeGh(responses: Record<string, FakeResponse[]>): { calls: string[][]; gh: GhRunner } {
  const calls: string[][] = [];
  const queues = new Map(Object.entries(responses).map(([key, value]) => [key, [...value]]));
  const gh: GhRunner = (args) => {
    calls.push(args);
    const key = args[0] === '--version' ? 'version' : args.slice(0, 3).join(' ');
    const queue = queues.get(key);
    if (queue === undefined || queue.length === 0) {
      return { status: 1, stderr: `unexpected gh call: ${args.join(' ')}`, stdout: '' };
    }
    const item = queue.length > 1 ? (queue.shift() ?? queue[0]) : queue[0];
    if (typeof item === 'string') {
      return { status: 0, stderr: '', stdout: item };
    }
    return { status: item.status ?? 0, stderr: item.stderr ?? '', stdout: item.stdout ?? '' };
  };
  return { calls, gh };
}

const VERSION_OK = 'gh version 2.106.0 (2025-10-01)';
const AUTH_OK = 'Logged in to github.com account ZRoger95';

function viewPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    state: 'OPEN',
    baseRefName: 'master',
    mergeCommit: null,
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
    expect(parseArgs(['6', '--subject'])).toEqual({ ok: false, error: '未识别参数：--subject' });
  });

  test('合法输入返回 PR 号', () => {
    expect(parseArgs(['6'])).toEqual({ ok: true, prNumber: 6 });
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
    const { logs, promise } = run(['6', '--subject'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls).toHaveLength(0);
    expect(logs.join('\n')).toContain('未识别参数');
  });

  test('gh 版本过低退出 1 且不合并', async () => {
    const { calls, gh } = fakeGh({ version: ['gh version 2.10.0 (2023-01-01)'] });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
    expect(logs.join('\n')).toContain('版本');
  });

  test('未登录退出 1 且不合并', async () => {
    const { calls, gh } = fakeGh({ version: [VERSION_OK], 'auth status': [{ status: 1, stderr: 'not logged in' }] });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
    expect(logs.join('\n')).toContain('gh auth login');
  });

  test('PR 已合并退出 0 且不重复合并', async () => {
    const { calls, gh } = fakeGh({
      version: [VERSION_OK],
      'auth status': [AUTH_OK],
      'pr view 6': [viewPayload({ state: 'MERGED', mergeCommit: { oid: 'abc123' } })],
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(0);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
    expect(logs.join('\n')).toContain('已合并 PR #6：abc123');
  });

  test('PR 非 OPEN 退出 1 且不合并', async () => {
    const { calls, gh } = fakeGh({
      version: [VERSION_OK],
      'auth status': [AUTH_OK],
      'pr view 6': [viewPayload({ state: 'CLOSED' })],
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
    expect(logs.join('\n')).toContain('CLOSED');
  });

  test('base 非 master 退出 1 且不合并', async () => {
    const { calls, gh } = fakeGh({
      version: [VERSION_OK],
      'auth status': [AUTH_OK],
      'pr view 6': [viewPayload({ baseRefName: 'develop' })],
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(calls.some((args) => args.includes('merge'))).toBe(false);
    expect(logs.join('\n')).toContain('master');
  });

  test('启用自动合并失败退出 1 且不轮询', async () => {
    const { calls, gh } = fakeGh({
      version: [VERSION_OK],
      'auth status': [AUTH_OK],
      'pr view 6': [viewPayload()],
      'pr merge 6': [{ status: 1, stderr: 'Auto-merge is not allowed for this repository' }],
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(logs.join('\n')).toContain('Auto-merge is not allowed');
    expect(calls.filter((args) => args.slice(0, 3).join(' ') === 'pr view 6')).toHaveLength(1);
  });

  test('启用自动合并时不传标题与正文，合并完成后退出 0', async () => {
    const { calls, gh } = fakeGh({
      version: [VERSION_OK],
      'auth status': [AUTH_OK],
      'pr view 6': [viewPayload(), viewPayload({ state: 'MERGED', mergeCommit: { oid: 'abc123' } })],
      'pr merge 6': [''],
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(0);
    const mergeCall = calls.find((args) => args.includes('merge'));
    expect(mergeCall).toEqual(['pr', 'merge', '6', '--squash', '--auto']);
    expect(logs.join('\n')).toContain('已合并 PR #6：abc123');
    expect(logs.join('\n')).toContain('git switch master');
  });

  test('轮询期间 PR 被关闭退出 1', async () => {
    const { gh } = fakeGh({
      version: [VERSION_OK],
      'auth status': [AUTH_OK],
      'pr view 6': [viewPayload(), viewPayload({ state: 'CLOSED' })],
      'pr merge 6': [''],
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(logs.join('\n')).toContain('未合并');
  });

  test('轮询读取状态失败退出 1', async () => {
    const { gh } = fakeGh({
      version: [VERSION_OK],
      'auth status': [AUTH_OK],
      'pr view 6': [viewPayload(), { status: 1, stderr: 'network down' }],
      'pr merge 6': [''],
    });
    const { promise, logs } = run(['6'], gh);
    await expect(promise).resolves.toBe(1);
    expect(logs.join('\n')).toContain('network down');
  });

  test('等待超时退出 1 且提示自动合并仍启用', async () => {
    const { calls, gh } = fakeGh({
      version: [VERSION_OK],
      'auth status': [AUTH_OK],
      'pr view 6': [viewPayload()],
      'pr merge 6': [''],
    });
    let clock = 0;
    const { promise, logs } = run(['6'], gh, {
      now: () => {
        clock += 600000;
        return clock;
      },
    });
    await expect(promise).resolves.toBe(1);
    expect(calls.filter((args) => args.includes('merge'))).toHaveLength(1);
    expect(logs.join('\n')).toContain('自动合并保持启用');
  });
});
