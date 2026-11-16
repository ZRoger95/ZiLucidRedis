import type { AnalysisResult } from '../types';

interface SummaryBarProps {
  counts: AnalysisResult['counts'];
  missing: string[];
  warningCount: number;
  onJump: (kind: 'changed' | 'unknown' | 'removed' | 'newer' | 'duplicate' | 'missing') => void;
}

export function SummaryBar({ counts, missing, warningCount, onJump }: SummaryBarProps) {
  return (
    <div className="summary">
      <button type="button" onClick={() => onJump('changed')}>
        已改 {counts.changed}
      </button>
      <button type="button" onClick={() => onJump('unknown')}>
        未知 {counts.unknown}
      </button>
      <button type="button" onClick={() => onJump('removed')}>
        已移除 {counts.removed}
      </button>
      <button type="button" onClick={() => onJump('newer')}>
        版本不支持 {counts.newer}
      </button>
      <button type="button" onClick={() => onJump('duplicate')}>
        重复 {counts.duplicate}
      </button>
      <span className={warningCount ? 'warn' : ''}>告警 {warningCount}</span>
      {missing.length > 0 && (
        <button type="button" className="danger" onClick={() => onJump('missing')}>
          缺失: {missing.join('、')}
        </button>
      )}
    </div>
  );
}
