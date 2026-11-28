export type ParseArgsResult = { ok: true; prNumber: number } | { ok: false; error: string };

const PR_NUMBER_RE = /^[1-9]\d*$/;

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
