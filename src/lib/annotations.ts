import type { AnnotationMode, LineAnalysis, ParsedLine, Status } from '../types';

export interface AnnotationBlock {
  atLineNo: number;
  name: string;
  text: string[];
}

export function buildAnnotationBlocks(
  lines: ParsedLine[],
  byLine: Map<number, LineAnalysis>,
  mode: AnnotationMode,
  onlyDiff = false,
): AnnotationBlock[] {
  if (mode === 'off') return [];
  const blocks: AnnotationBlock[] = [];

  for (const line of lines) {
    if (line.kind !== 'directive') continue;
    const analysis = byLine.get(line.lineNo);
    const doc = analysis?.doc;
    if (!analysis || !doc || doc.comment.length === 0) continue;
    if (onlyDiff && (analysis.status === 'default' || analysis.status === 'no-default' || analysis.status === 'special')) {
      continue;
    }

    const previous = lines.find((item) => item.lineNo === line.lineNo - 1);
    if (mode === 'missing' && previous?.kind === 'comment') continue;

    const defaultText = doc.defaultValue === null ? '官方未给出' : doc.defaultValue;
    blocks.push({
      atLineNo: line.lineNo,
      name: doc.name,
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
