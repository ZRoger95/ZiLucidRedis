import type { AnnotationMode, DirectiveDoc, LineAnalysis, ParsedLine, Status } from '../types';

export interface AnnotationBlock {
  atLineNo: number;
  name: string;
  summary: string;
  text: string[];
}

const REDUNDANT_DEFAULT_CLAUSE = /，默认\s*(.+)$/;

function trimDefaultClause(text: string, defaultValue: string | null): string {
  if (defaultValue === null) {
    return text;
  }
  const match = REDUNDANT_DEFAULT_CLAUSE.exec(text);
  if (!match) {
    return text;
  }
  const value = match[1].replace(/个$/, '').trim();
  return value === defaultValue ? text.slice(0, match.index) : text;
}

export function annotationSummary(doc: DirectiveDoc, zhNotes: Record<string, string>): string {
  const defaultText = doc.defaultValue === null ? '官方未给出' : doc.defaultValue;
  const note = zhNotes[doc.name];
  if (!note) {
    return `官方注释 · 默认值：${defaultText}`;
  }
  return `${trimDefaultClause(note, doc.defaultValue)} · 默认值：${defaultText}`;
}

export function buildAnnotationBlocks(
  lines: ParsedLine[],
  byLine: Map<number, LineAnalysis>,
  mode: AnnotationMode,
  onlyDiff = false,
  zhNotes: Record<string, string> = {},
): AnnotationBlock[] {
  if (mode === 'off') {
    return [];
  }
  const blocks: AnnotationBlock[] = [];

  for (const line of lines) {
    if (line.kind !== 'directive') {
      continue;
    }
    const analysis = byLine.get(line.lineNo);
    const doc = analysis?.doc;
    if (!analysis || !doc || doc.comment.length === 0) {
      continue;
    }
    if (
      onlyDiff &&
      (analysis.status === 'default' || analysis.status === 'no-default' || analysis.status === 'special')
    ) {
      continue;
    }

    const previous = lines.find((item) => item.lineNo === line.lineNo - 1);
    if (mode === 'missing' && previous?.kind === 'comment') {
      continue;
    }

    const defaultText = doc.defaultValue === null ? '官方未给出' : doc.defaultValue;
    blocks.push({
      atLineNo: line.lineNo,
      name: doc.name,
      summary: annotationSummary(doc, zhNotes),
      text: [...doc.comment, `默认值: ${defaultText}`],
    });
  }

  return blocks;
}

export const STATUS_LABELS: Record<Status, string> = {
  default: '默认值',
  changed: '已改',
  'no-default': '无默认值',
  unknown: '未知',
  removed: '已移除',
  newer: '版本不支持',
  duplicate: '重复',
  special: '特殊指令',
};

export function statusClass(status: Status | undefined): string {
  return status ? `cm-status-${status}` : '';
}
