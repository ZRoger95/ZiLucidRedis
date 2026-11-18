import type { AnalysisResult, RiskWarning } from '../types';

export type CheckupKind = 'warning' | 'missing' | 'changed' | 'unknown' | 'removed' | 'newer' | 'duplicate';

export interface CheckupItem {
  id: string;
  kind: CheckupKind;
  label: string;
  detail?: string;
  lineNo: number | null;
  level?: RiskWarning['level'];
}

export interface CheckupGroup {
  kind: CheckupKind;
  label: string;
  items: CheckupItem[];
}

export const CHECKUP_KIND_LABELS: Record<CheckupKind, string> = {
  warning: '告警',
  missing: '缺失',
  changed: '已改',
  unknown: '未知',
  removed: '已移除',
  newer: '版本不支持',
  duplicate: '重复',
};

const KIND_ORDER: CheckupKind[] = ['warning', 'missing', 'changed', 'unknown', 'removed', 'newer', 'duplicate'];
const STATUS_KINDS = new Set<CheckupKind>(['changed', 'unknown', 'removed', 'newer', 'duplicate']);

export function buildCheckup(analysis: AnalysisResult, warnings: RiskWarning[]): CheckupGroup[] {
  const items: Record<CheckupKind, CheckupItem[]> = {
    warning: [],
    missing: [],
    changed: [],
    unknown: [],
    removed: [],
    newer: [],
    duplicate: [],
  };

  for (const [lineNo, entry] of analysis.byLine) {
    const kind = entry.status as CheckupKind;
    if (!STATUS_KINDS.has(kind)) {
      continue;
    }
    const line = analysis.lines[lineNo - 1];
    items[kind].push({
      id: `${kind}-${lineNo}`,
      kind,
      label: line?.name ?? entry.doc?.name ?? '未知指令',
      detail: entry.note ?? line?.raw.trim(),
      lineNo,
    });
  }

  for (const kind of STATUS_KINDS) {
    items[kind].sort((left, right) => (left.lineNo ?? 0) - (right.lineNo ?? 0));
  }

  for (const warning of warnings) {
    items.warning.push({
      id: `warning-${warning.id}`,
      kind: 'warning',
      label: warning.message,
      lineNo: warning.lineNos[0] ?? null,
      level: warning.level,
    });
  }

  for (const name of analysis.missing) {
    items.missing.push({
      id: `missing-${name}`,
      kind: 'missing',
      label: name,
      detail: '未显式配置',
      lineNo: null,
    });
  }

  return KIND_ORDER.map((kind) => ({ kind, label: CHECKUP_KIND_LABELS[kind], items: items[kind] })).filter(
    (group) => group.items.length > 0,
  );
}
