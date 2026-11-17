import type { AnalysisResult } from '../types';

interface SummaryBarProps {
  counts: AnalysisResult['counts'];
  missing: string[];
  warningCount: number;
  onJump: (kind: 'changed' | 'unknown' | 'removed' | 'newer' | 'duplicate' | 'missing') => void;
}

const ITEM_CLASS = 'rounded-full border border-transparent px-2 py-0.5 hover:border-line hover:bg-panel';

export function SummaryBar({ counts, missing, warningCount, onJump }: SummaryBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-white px-3.5 py-2 text-[13px]">
      <button type="button" className={ITEM_CLASS} onClick={() => onJump('changed')}>
        已改 {counts.changed}
      </button>
      <button type="button" className={ITEM_CLASS} onClick={() => onJump('unknown')}>
        未知 {counts.unknown}
      </button>
      <button type="button" className={ITEM_CLASS} onClick={() => onJump('removed')}>
        已移除 {counts.removed}
      </button>
      <button type="button" className={ITEM_CLASS} onClick={() => onJump('newer')}>
        版本不支持 {counts.newer}
      </button>
      <button type="button" className={ITEM_CLASS} onClick={() => onJump('duplicate')}>
        重复 {counts.duplicate}
      </button>
      <span className={warningCount ? 'text-warning' : ''}>告警 {warningCount}</span>
      {missing.length > 0 && (
        <button
          type="button"
          className="rounded-full border border-transparent px-2 py-0.5 font-semibold text-unknown hover:border-line hover:bg-panel"
          onClick={() => onJump('missing')}
        >
          缺失: {missing.join('、')}
        </button>
      )}
    </div>
  );
}
