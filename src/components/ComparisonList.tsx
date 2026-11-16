import type { AnalysisResult, DictFile, RiskWarning, Status } from '../types';
import { STATUS_LABELS } from '../lib/annotations';

interface ComparisonListProps {
  result: AnalysisResult;
  dict: DictFile;
  warnings: RiskWarning[];
  onlyDiff: boolean;
  onJump: (lineNo: number) => void;
}

interface Row {
  key: string;
  lineNo: number | null;
  name: string;
  current: string;
  fallback: string;
  status: Status | 'missing';
  risks: RiskWarning[];
}

const LEVEL_SHORT: Record<RiskWarning['level'], string> = { high: '高危', medium: '中危', low: '提示' };

export function ComparisonList({ result, dict, warnings, onlyDiff, onJump }: ComparisonListProps) {
  const byLineWarnings = new Map<number, RiskWarning[]>();
  const floating: RiskWarning[] = [];
  for (const warning of warnings) {
    if (warning.lineNos.length === 0) floating.push(warning);
    for (const lineNo of warning.lineNos) {
      byLineWarnings.set(lineNo, [...(byLineWarnings.get(lineNo) ?? []), warning]);
    }
  }

  const rows: Row[] = [];
  for (const line of result.lines) {
    if (line.kind !== 'directive' || !line.name) continue;
    const entry = result.byLine.get(line.lineNo);
    rows.push({
      key: `line-${line.lineNo}`,
      lineNo: line.lineNo,
      name: line.name,
      current: (line.args ?? []).join(' ') || '（空）',
      fallback: entry?.doc?.defaultValue === null || entry?.doc === undefined ? '—' : entry.doc.defaultValue || '""',
      status: entry?.status ?? 'unknown',
      risks: byLineWarnings.get(line.lineNo) ?? [],
    });
  }

  for (const name of result.missing) {
    const doc = dict.directives.find((directive) => directive.name === name);
    rows.push({
      key: `missing-${name}`,
      lineNo: null,
      name,
      current: '未配置',
      fallback: doc?.defaultValue ?? '—',
      status: 'missing',
      risks: [],
    });
  }

  const visible = onlyDiff
    ? rows.filter(
        (row) => row.status === 'missing' || (row.status !== 'default' && row.status !== 'no-default' && row.status !== 'special') || row.risks.length > 0,
      )
    : rows;

  return (
    <section className="compare" aria-label="配置对比">
      <div className="compare-head">
        <span className="compare-count">
          {onlyDiff ? `差异 ${visible.length} 项 / 共 ${rows.length} 项` : `共 ${rows.length} 项`}
        </span>
        <span className="compare-hint">点击任意行同时在左右两栏定位</span>
      </div>

      {floating.length > 0 ? (
        <ul className="compare-risks">
          {floating.map((warning) => (
            <li key={warning.id} className={`level-${warning.level}`}>
              {LEVEL_SHORT[warning.level]}：{warning.message}（依据默认值）
            </li>
          ))}
        </ul>
      ) : null}

      {visible.length === 0 ? (
        <p className="compare-empty">当前配置与官方默认值一致，没有差异项。</p>
      ) : (
        <div className="compare-scroll">
          <table>
            <thead>
              <tr>
                <th className="col-line">行</th>
                <th className="col-name">指令</th>
                <th>你的配置</th>
                <th>官方默认</th>
                <th className="col-status">状态</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.key}
                  className={`status-${row.status}`}
                  onClick={() => row.lineNo && onJump(row.lineNo)}
                  onKeyDown={(event) => {
                    if (row.lineNo && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onJump(row.lineNo);
                    }
                  }}
                  tabIndex={row.lineNo ? 0 : -1}
                >
                  <td className="col-line">{row.lineNo ?? '—'}</td>
                  <td className="col-name">{row.name}</td>
                  <td className={row.current === row.fallback ? '' : 'diff'}>{row.current}</td>
                  <td>{row.fallback}</td>
                  <td className="col-status">
                    <span className={`badge ${row.status}`}>{row.status === 'missing' ? '未配置' : STATUS_LABELS[row.status]}</span>
                    {row.risks.map((warning) => (
                      <span key={warning.id} className="risk-flag" title={warning.message}>
                        ⚠ {LEVEL_SHORT[warning.level]}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
