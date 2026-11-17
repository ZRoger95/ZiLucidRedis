import { useMemo, useState } from 'react';

import type { DiffModel, DiffRow, DiffSegment } from '../lib/diff';
import type { RiskWarning } from '../types';

import { cn } from '../lib/utils';

interface DiffViewProps {
  model: DiffModel;
  warnings: RiskWarning[];
  onlyDiff: boolean;
  hasContent?: boolean;
  baseline?: string;
  onJump: (lineNo: number) => void;
  onApplyDefault: (lineNo: number, value: string) => void;
}

type DisplayItem = { type: 'row'; row: DiffRow } | { type: 'collapse'; key: string; rows: DiffRow[] };

const LEVEL_SHORT: Record<RiskWarning['level'], string> = { high: '高危', medium: '中危', low: '提示' };

const LEVEL_CLASS: Record<RiskWarning['level'], string> = {
  high: 'text-unknown',
  medium: 'text-warning',
  low: '',
};

function Segments({ segments, side }: { segments: DiffSegment[]; side: 'left' | 'right' }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.changed ? (
          <span
            key={index}
            className={cn('rounded-[2px] px-px', side === 'left' ? 'bg-diff-token-left' : 'bg-diff-token-right')}
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function leftBackground(kind: DiffRow['kind']): string {
  if (kind === 'changed' || kind === 'duplicate') {
    return 'bg-diff-left';
  }
  if (kind === 'removed' || kind === 'unknown') {
    return 'bg-diff-removed';
  }
  if (kind === 'newer') {
    return 'bg-diff-newer';
  }
  if (kind === 'special') {
    return 'bg-diff-special';
  }
  return '';
}

function rightBackground(kind: DiffRow['kind']): string {
  if (kind === 'changed' || kind === 'duplicate') {
    return 'bg-diff-right';
  }
  if (kind === 'added') {
    return 'bg-diff-added';
  }
  return '';
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
  const leftBg = leftBackground(row.kind);
  const rightBg = rightBackground(row.kind);

  return (
    <div
      className={cn(
        'grid grid-cols-[52px_minmax(0,1fr)_28px_minmax(0,1fr)_52px] border-b border-[#f2f3f5] font-mono text-xs leading-[1.7] hover:shadow-[inset_0_0_0_1px_#c7d2fe] focus-visible:[outline:2px_solid_#6366f1] focus-visible:[outline-offset:-2px]',
        row.kind === 'default' && '[&_.diff-cell]:text-muted-foreground',
      )}
      tabIndex={firstLeft ? 0 : -1}
      onKeyDown={(event) => {
        if (firstLeft && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onJump(firstLeft);
        }
      }}
    >
      <div className="select-none px-1.5 py-0.5 text-right text-muted-foreground">
        {Array.from({ length: height }, (_, index) => (
          <div key={index} className="whitespace-nowrap">
            {left[index]?.lineNo ?? ''}
          </div>
        ))}
      </div>

      <div className={cn('diff-cell break-all px-2 py-0.5 whitespace-pre-wrap', leftBg)}>
        {Array.from({ length: height }, (_, index) => {
          const line = left[index];
          return (
            <div key={index} className="min-h-[1.7em] cursor-pointer" onClick={() => line && onJump(line.lineNo)}>
              {line ? <Segments segments={line.segments} side="left" /> : null}
              {line && index === height - 1 && row.risks.length > 0 ? (
                <span className="ml-1.5 font-sans text-[11px] text-warning" title={riskTitle}>
                  ⚠
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex justify-center pt-0.5">
        {row.canApplyDefault && row.applyValue !== null && firstLeft ? (
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent px-1 text-[#9aa1ad] hover:text-[#4f46e5]"
            aria-label={`将 ${row.name} 改回官方默认值`}
            title="改回官方默认值"
            onClick={() => onApplyDefault(firstLeft, row.applyValue as string)}
          >
            »
          </button>
        ) : (
          <span className="cursor-default px-1 text-[#9aa1ad]" aria-hidden="true">
            »
          </span>
        )}
      </div>

      <div className={cn('diff-cell break-all px-2 py-0.5 whitespace-pre-wrap', rightBg)}>
        {Array.from({ length: height }, (_, index) => (
          <div key={index} className="min-h-[1.7em] cursor-default">
            {right[index] ? <Segments segments={right[index].segments} side="right" /> : null}
          </div>
        ))}
      </div>

      <div className="select-none px-1.5 py-0.5 text-left text-muted-foreground">
        {Array.from({ length: height }, (_, index) => (
          <div key={index} className="whitespace-nowrap">
            {right[index]?.lineNo ?? ''}
          </div>
        ))}
      </div>

      {row.note ? (
        <div className="col-start-2 col-end-5 px-2 pb-1 font-sans text-[11px] text-muted-foreground">{row.note}</div>
      ) : null}
    </div>
  );
}

export function DiffView({
  model,
  warnings,
  onlyDiff,
  hasContent = true,
  baseline,
  onJump,
  onApplyDefault,
}: DiffViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const items = useMemo<DisplayItem[]>(() => {
    if (onlyDiff) {
      return model.rows.map((row) => ({ type: 'row', row }));
    }

    const result: DisplayItem[] = [];
    for (let index = 0; index < model.rows.length; index += 1) {
      const row = model.rows[index];
      if (row.kind !== 'default') {
        result.push({ type: 'row', row });
        continue;
      }

      let end = index;
      while (end < model.rows.length && model.rows[end].kind === 'default') {
        end += 1;
      }
      const run = model.rows.slice(index, end);
      const key = `run-${run[0].key}`;

      if (run.length > 2 && !expanded.has(key)) {
        result.push({ type: 'collapse', key, rows: run });
      } else {
        run.forEach((item) => result.push({ type: 'row', row: item }));
      }

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
    <section className="flex h-full min-h-0 flex-col bg-white" aria-label="配置对比">
      <div className="flex items-baseline gap-2.5 px-3.5 pt-2 pb-1.5">
        <strong className="text-[13px]">你的配置</strong>
        <span className="text-xs text-muted-foreground">
          差异 {diffCount} 项 / 共 {model.total} 项
        </span>
        <span className="text-xs text-[#6b7280]">官方默认{baseline ? ` · ${baseline}` : ''}</span>
        <span className="ml-auto text-xs text-[#9aa1ad]">点击左侧行在编辑器中定位</span>
      </div>

      {floating.length > 0 ? (
        <ul className="m-0 list-none px-3.5 pb-1.5 text-xs">
          {floating.map((warning) => (
            <li key={warning.id} className={LEVEL_CLASS[warning.level]}>
              {LEVEL_SHORT[warning.level]}：{warning.message}
            </li>
          ))}
        </ul>
      ) : null}

      {model.rows.length === 0 ? (
        <p className="m-0 px-3.5 pt-2.5 pb-3.5 text-[13px] text-muted-foreground">
          {hasContent ? '当前配置与官方默认值一致' : '先在左侧载入或粘贴配置'}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {items.map((item) =>
            item.type === 'collapse' ? (
              <button
                key={item.key}
                type="button"
                className="w-full cursor-pointer border-0 border-b border-[#f2f3f5] bg-[#fbfbfc] px-3.5 py-[3px] text-center font-mono text-xs text-[#6b7280] hover:text-[#4f46e5]"
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
