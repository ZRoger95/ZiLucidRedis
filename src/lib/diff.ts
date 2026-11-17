import type { AnalysisResult, DictFile, DirectiveDoc, LineAnalysis, ParsedLine, RiskWarning, Status } from '../types';
import { MULTI_VALUE_NAMES, SPECIAL_NAMES } from './analyze';
import { normalizeValue } from './normalize';
import { tokenizeArgs } from './parseConf';

export interface DiffSegment {
  text: string;
  changed: boolean;
}

const TOKEN_RE = /(\s+|\S+)/g;
const MAX_TOKENS = 400;

const tokenize = (text: string): string[] => text.match(TOKEN_RE) ?? [];

const pushSegment = (target: DiffSegment[], text: string, changed: boolean) => {
  if (!text) return;
  const last = target[target.length - 1];
  if (last && last.changed === changed) {
    last.text += text;
    return;
  }
  target.push({ text, changed });
};

export function diffSegments(
  leftText: string,
  rightText: string,
): { left: DiffSegment[]; right: DiffSegment[] } {
  const leftTokens = tokenize(leftText);
  const rightTokens = tokenize(rightText);

  if (leftTokens.length > MAX_TOKENS || rightTokens.length > MAX_TOKENS) {
    return {
      left: [{ text: leftText, changed: true }],
      right: [{ text: rightText, changed: true }],
    };
  }

  const rows = leftTokens.length;
  const cols = rightTokens.length;
  const dp: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      dp[i][j] =
        leftTokens[i] === rightTokens[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const left: DiffSegment[] = [];
  const right: DiffSegment[] = [];
  let i = 0;
  let j = 0;

  while (i < rows && j < cols) {
    if (leftTokens[i] === rightTokens[j]) {
      pushSegment(left, leftTokens[i], false);
      pushSegment(right, rightTokens[j], false);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushSegment(left, leftTokens[i], true);
      i += 1;
    } else {
      pushSegment(right, rightTokens[j], true);
      j += 1;
    }
  }

  while (i < rows) {
    pushSegment(left, leftTokens[i], true);
    i += 1;
  }
  while (j < cols) {
    pushSegment(right, rightTokens[j], true);
    j += 1;
  }

  return { left, right };
}

export type DiffKind =
  | 'changed'
  | 'default'
  | 'added'
  | 'removed'
  | 'newer'
  | 'unknown'
  | 'duplicate'
  | 'special'
  | 'no-default';

export interface DiffLine {
  lineNo: number;
  segments: DiffSegment[];
}

export interface DiffCell {
  lines: DiffLine[];
}

export interface DiffRow {
  key: string;
  kind: DiffKind;
  name: string;
  canonicalName: string;
  left: DiffCell | null;
  right: DiffCell | null;
  status: Status | null;
  risks: RiskWarning[];
  note?: string;
  canApplyDefault: boolean;
  applyValue: string | null;
}

export interface DiffModel {
  rows: DiffRow[];
  counts: Record<DiffKind, number>;
  total: number;
}

interface LineGroup {
  name: string;
  lines: ParsedLine[];
  entries: LineAnalysis[];
}

const ONLY_DIFF_KINDS = new Set<DiffKind>(['changed', 'added', 'removed', 'newer', 'unknown', 'duplicate']);

const defaultLiteral = (doc: DirectiveDoc) => (doc.defaultValue === '' ? '""' : doc.defaultValue ?? '');

const splitSegments = (segments: DiffSegment[]): DiffSegment[][] => {
  const lines: DiffSegment[][] = [[]];
  for (const segment of segments) {
    segment.text.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, changed: segment.changed });
    });
  }
  return lines;
};

const plain = (text: string): DiffSegment[] => [{ text, changed: false }];

function buildGroupRow(canonical: string, group: LineGroup, doc: DirectiveDoc | undefined): DiffRow {
  const leftText = group.lines.map((line) => line.raw.trim()).join('\n');
  const status = group.entries[0]?.status ?? null;
  let kind: DiffKind;
  let note = group.entries.find((entry) => entry.note)?.note;
  let rightText: string | null = null;
  let applyValue: string | null = null;

  if (!doc) {
    if (SPECIAL_NAMES.has(group.name)) kind = 'special';
    else if (status === 'removed') kind = 'removed';
    else if (status === 'newer') kind = 'newer';
    else kind = 'unknown';
  } else {
    const multi = MULTI_VALUE_NAMES.has(doc.name);
    if (group.lines.length > 1 && !multi) {
      kind = 'duplicate';
      note = note ?? '同名指令重复，后出现的会覆盖前面的值';
    } else if (doc.defaultValue === null) {
      kind = 'no-default';
    } else {
      const leftArgs = group.lines.flatMap((line) => line.args ?? []);
      const equal =
        normalizeValue(doc, leftArgs) === normalizeValue(doc, tokenizeArgs(doc.defaultValue).args);
      kind = equal ? 'default' : 'changed';
    }

    if (doc.defaultValue === null) {
      rightText = `${doc.name} （官方无默认值）`;
    } else {
      rightText = `${doc.name} ${defaultLiteral(doc)}`;
    }

    if (kind === 'changed' && group.lines.length === 1 && !multi && !SPECIAL_NAMES.has(group.name)) {
      applyValue = defaultLiteral(doc);
    }

    if (group.name !== doc.name) {
      note = `旧名：${group.name} → ${doc.name}`;
    }
  }

  let leftSegments: DiffSegment[];
  let rightSegments: DiffSegment[] | null = null;
  if (rightText !== null && (kind === 'changed' || kind === 'duplicate')) {
    const result = diffSegments(leftText, rightText);
    leftSegments = result.left;
    rightSegments = result.right;
  } else if (rightText !== null) {
    leftSegments = plain(leftText);
    rightSegments = plain(rightText);
  } else {
    leftSegments = plain(leftText);
  }

  const leftNumbers = group.lines.map((line) => line.lineNo);
  const leftLines = splitSegments(leftSegments).map((segments, index) => ({
    lineNo: leftNumbers[Math.min(index, leftNumbers.length - 1)] ?? 0,
    segments,
  }));

  return {
    key: `name-${canonical}`,
    kind,
    name: group.name,
    canonicalName: canonical,
    left: { lines: leftLines },
    right: rightSegments ? { lines: splitSegments(rightSegments).map((segments) => ({ lineNo: 0, segments })) } : null,
    status,
    risks: [],
    note,
    canApplyDefault: applyValue !== null,
    applyValue,
  };
}

function buildAddedRow(doc: DirectiveDoc): DiffRow {
  const value = doc.defaultValue === null ? '（官方无默认值）' : defaultLiteral(doc);
  const text = `${doc.name} ${value}`;
  return {
    key: `added-${doc.name}`,
    kind: 'added',
    name: doc.name,
    canonicalName: doc.name,
    left: null,
    right: { lines: [{ lineNo: 0, segments: plain(text) }] },
    status: null,
    risks: [],
    canApplyDefault: false,
    applyValue: null,
  };
}

export function buildDiff(
  analysis: AnalysisResult,
  dict: DictFile,
  warnings: RiskWarning[],
  options: { onlyDiff: boolean },
): DiffModel {
  const docs = new Map(dict.directives.map((doc) => [doc.name, doc]));
  const groups = new Map<string, LineGroup>();

  for (const line of analysis.lines) {
    if (line.kind !== 'directive' || !line.name) continue;
    const entry = analysis.byLine.get(line.lineNo);
    const canonical = entry?.doc?.name ?? line.name;
    const group = groups.get(canonical) ?? { name: line.name, lines: [], entries: [] };
    group.lines.push(line);
    if (entry) group.entries.push(entry);
    groups.set(canonical, group);
  }

  const rows: DiffRow[] = [];
  for (const [canonical, group] of groups) {
    rows.push(buildGroupRow(canonical, group, docs.get(canonical)));
  }
  for (const name of analysis.missing) {
    const doc = docs.get(name);
    if (!doc || groups.has(name)) continue;
    rows.push(buildAddedRow(doc));
  }

  for (const row of rows) {
    const lineNos = new Set(row.left?.lines.map((line) => line.lineNo) ?? []);
    row.risks = warnings.filter((warning) => warning.lineNos.some((lineNo) => lineNos.has(lineNo)));
  }

  let rightNo = 0;
  for (const row of rows) {
    if (!row.right) continue;
    for (const line of row.right.lines) {
      rightNo += 1;
      line.lineNo = rightNo;
    }
  }

  const counts: Record<DiffKind, number> = {
    changed: 0,
    default: 0,
    added: 0,
    removed: 0,
    newer: 0,
    unknown: 0,
    duplicate: 0,
    special: 0,
    'no-default': 0,
  };
  for (const row of rows) counts[row.kind] += 1;

  const visible = options.onlyDiff
    ? rows.filter((row) => ONLY_DIFF_KINDS.has(row.kind) || row.risks.length > 0)
    : rows;

  return { rows: visible, counts, total: rows.length };
}

export function applyDefaultLine(text: string, lineNo: number, defaultValue: string): string {
  const rows = text.split('\n');
  const index = lineNo - 1;
  if (index < 0 || index >= rows.length) return text;

  const current = rows[index];
  const indent = /^\s*/.exec(current)?.[0] ?? '';
  const name = current.trim().split(/\s+/)[0] ?? '';
  if (!name) return text;

  const value = defaultValue === '' ? '""' : defaultValue;
  rows[index] = `${indent}${name} ${value}`;
  return rows.join('\n');
}
