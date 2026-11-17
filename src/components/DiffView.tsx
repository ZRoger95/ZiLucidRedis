import { useMemo, useState } from 'react';
import type { DiffModel, DiffRow, DiffSegment } from '../lib/diff';
import type { RiskWarning } from '../types';

interface DiffViewProps {
  model: DiffModel;
  warnings: RiskWarning[];
  onlyDiff: boolean;
  onJump: (lineNo: number) => void;
  onApplyDefault: (lineNo: number, value: string) => void;
}

type DisplayItem =
  | { type: 'row'; row: DiffRow }
  | { type: 'collapse'; key: string; rows: DiffRow[] };

const LEVEL_SHORT: Record<RiskWarning['level'], string> = { high: '高危', medium: '中危', low: '提示' };

function Segments({ segments }: { segments: DiffSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.changed ? (
          <span key={index} className="diff-token">
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function DiffRowView({
  row,
  onJump,
  onApplyDefault,
}: {
  row: DiffRow;
  onJump: (lineNo: number) => void;
  onApplyDefault: (lineNo: number, value: string) => void;
}) {
  const left = row.left?.lines ?? [];
  const right = row.right?.lines ?? [];
  const height = Math.max(left.length, right.length, 1);
  const firstLeft = left[0]?.lineNo ?? 0;
  const riskTitle = row.risks.map((risk) => `${LEVEL_SHORT[risk.level]}：${risk.message}`).join('\n');

  return (
    <div
      className={`diff-row is-${row.kind}`}
      tabIndex={firstLeft ? 0 : -1}
      onKeyDown={(event) => {
        if (firstLeft && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onJump(firstLeft);
        }
      }}
    >
      <div className="diff-nos left">
        {Array.from({ length: height }, (_, index) => (
          <div key={index} className="diff-no">
            {left[index]?.lineNo ?? ''}
          </div>
        ))}
      </div>

      <div className="diff-cell left">
        {Array.from({ length: height }, (_, index) => {
          const line = left[index];
          return (
            <div
              key={index}
              className="diff-line"
              onClick={() => line && onJump(line.lineNo)}
            >
              {line ? <Segments segments={line.segments} /> : null}
              {line && index === height - 1 && row.risks.length > 0 ? (
                <span className="diff-risk" title={riskTitle}>
                  ⚠
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="diff-gutter">
        {row.canApplyDefault && row.applyValue !== null && firstLeft ? (
          <button
            type="button"
            className="diff-arrow"
            aria-label={`将 ${row.name} 改回官方默认值`}
            title="改回官方默认值"
            onClick={() => onApplyDefault(firstLeft, row.applyValue as string)}
          >
            »
          </button>
        ) : (
          <span className="diff-arrow is-static" aria-hidden="true">
            »
          </span>
        )}
      </div>

      <div className="diff-cell right">
        {Array.from({ length: height }, (_, index) => (
          <div key={index} className="diff-line">
            {right[index] ? <Segments segments={right[index].segments} /> : null}
          </div>
        ))}
      </div>

      <div className="diff-nos right">
        {Array.from({ length: height }, (_, index) => (
          <div key={index} className="diff-no">
            {right[index]?.lineNo ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DiffView({ model, warnings, onlyDiff, onJump, onApplyDefault }: DiffViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const items = useMemo<DisplayItem[]>(() => {
    if (onlyDiff) return model.rows.map((row) => ({ type: 'row', row }));

    const result: DisplayItem[] = [];
    for (let index = 0; index < model.rows.length; index += 1) {
      const row = model.rows[index];
      if (row.kind !== 'default') {
        result.push({ type: 'row', row });
        continue;
      }

      let end = index;
      while (end < model.rows.length && model.rows[end].kind === 'default') end += 1;
      const run = model.rows.slice(index, end);
      const key = `run-${run[0].key}`;

      if (run.length > 2 && !expanded.has(key)) result.push({ type: 'collapse', key, rows: run });
      else run.forEach((item) => result.push({ type: 'row', row: item }));

      index = end - 1;
    }
    return result;
  }, [model.rows, onlyDiff, expanded]);

  const floating = warnings.filter((warning) => warning.lineNos.length === 0);
  const diffCount =
    model.counts.changed +
    model.counts.added +
    model.counts.removed +
    model.counts.newer +
    model.counts.unknown +
    model.counts.duplicate;

  return (
    <section className="diff" aria-label="配置对比">
      <div className="diff-head">
        <strong>你的配置</strong>
        <span className="diff-count">
          差异 {diffCount} 项 / 共 {model.total} 项
        </span>
        <span className="diff-hint">点击左侧行在编辑器中定位</span>
      </div>

      {floating.length > 0 ? (
        <ul className="diff-risks">
          {floating.map((warning) => (
            <li key={warning.id} className={`level-${warning.level}`}>
              {LEVEL_SHORT[warning.level]}：{warning.message}
            </li>
          ))}
        </ul>
      ) : null}

      {model.rows.length === 0 ? (
        <p className="diff-empty">当前配置与官方默认值一致</p>
      ) : (
        <div className="diff-scroll">
          {items.map((item) =>
            item.type === 'collapse' ? (
              <button
                key={item.key}
                type="button"
                className="diff-collapse"
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    next.add(item.key);
                    return next;
                  })
                }
              >
                @@ 展开 {item.rows.length} 行未修改 @@
              </button>
            ) : (
              <DiffRowView key={item.row.key} row={item.row} onJump={onJump} onApplyDefault={onApplyDefault} />
            ),
          )}
        </div>
      )}
    </section>
  );
}
