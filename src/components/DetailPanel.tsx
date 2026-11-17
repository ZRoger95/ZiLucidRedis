import { Button } from '@/components/ui/button';

import type { DetailView } from '../lib/describe';

import { cn } from '../lib/utils';

interface DetailPanelProps {
  view: DetailView;
  lineNo: number | null;
  onInsertDefault: () => void;
  onCopy: () => void;
}

const BADGE_BASE = 'inline-block rounded-full border border-line bg-panel px-2 py-0.5 text-xs text-muted-foreground';

const BADGE_STATUS: Record<string, string> = {
  default: 'text-muted-foreground',
  changed: 'border-[#fcd34d] bg-[#fffbeb] text-changed',
  'no-default': 'text-muted-foreground',
  unknown: 'border-[#fecaca] bg-[#fef2f2] text-unknown',
  removed: 'border-[#ddd6fe] bg-[#f5f3ff] text-newer',
  newer: 'border-[#ddd6fe] bg-[#f5f3ff] text-newer',
  duplicate: 'border-[#fecaca] bg-[#fef2f2] text-unknown',
  special: 'text-muted-foreground',
};

const LABEL = 'text-xs text-muted-foreground';

function noteText(isDiff: boolean, status: string | null): string {
  if (isDiff) {
    return '与默认值不同';
  }
  if (status === 'no-default') {
    return '官方未给出默认值';
  }
  return '与默认值一致';
}

export function DetailPanel({ view, lineNo, onInsertDefault, onCopy }: DetailPanelProps) {
  if (!view.name) {
    return (
      <aside className="min-h-0 overflow-auto px-5 pt-4 pb-[30px]" aria-label="配置项详情">
        <p className="text-[13px] text-muted-foreground">{view.body[0] ?? '把光标放到某条配置上查看说明。'}</p>
      </aside>
    );
  }

  return (
    <aside className="min-h-0 overflow-auto px-5 pt-4 pb-[30px]" aria-label="配置项详情">
      <div>
        <h2 className="mb-0.5 font-mono text-base">{view.name}</h2>
        <div className="mb-3 text-xs text-muted-foreground">
          {view.section}
          {lineNo ? ` · 第 ${lineNo} 行` : ''}
          {view.status ? (
            <>
              {' · '}
              <span className={cn(BADGE_BASE, BADGE_STATUS[view.status])}>{view.statusText}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[340px_minmax(0,1fr)] items-start gap-7 max-[1100px]:grid-cols-1 max-[1100px]:gap-0">
        <div>
          <section className="my-3 overflow-hidden rounded-lg border border-line" aria-label="当前值与默认值对比">
            <div
              className={cn(
                'grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2 border-b border-[#f0f1f3] px-2.5 py-1.5 text-[13px]',
                view.isDiff && 'bg-[#fffbeb]',
              )}
            >
              <span className={LABEL}>你的配置</span>
              <code className={cn('font-mono break-all', view.isDiff && 'font-semibold text-changed')}>
                {view.currentText}
              </code>
            </div>
            <div className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2 border-b border-[#f0f1f3] px-2.5 py-1.5 text-[13px]">
              <span className={LABEL}>官方默认</span>
              <code className="font-mono break-all">{view.defaultText}</code>
            </div>
            {view.rangeText ? (
              <div className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2 border-b border-[#f0f1f3] px-2.5 py-1.5 text-[13px]">
                <span className={LABEL}>取值范围</span>
                <code className="font-mono break-all">{view.rangeText}</code>
              </div>
            ) : null}
            <div className="bg-[#fafbfc] px-2.5 py-1 text-xs text-muted-foreground">
              {noteText(view.isDiff, view.status)}
            </div>
          </section>

          <div className="my-3 flex gap-2">
            <Button variant="outline" onClick={onInsertDefault} disabled={lineNo === null}>
              改回默认值
            </Button>
            <Button variant="outline" onClick={onCopy}>
              复制默认值
            </Button>
          </div>
        </div>

        <div>
          <section className="mt-3 border-t border-line pt-2.5 first:mt-0 first:border-t-0 first:pt-0">
            <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">中文摘要</h3>
            <p
              className={cn(
                'mb-1.5 text-[13px] leading-[1.65] whitespace-pre-wrap text-[#333840]',
                !view.zhText && 'text-[#949bab]',
              )}
            >
              {view.zhText ?? '这一项还没有整理中文摘要，可直接看下方官方说明。'}
            </p>
          </section>

          <section className="mt-3 border-t border-line pt-2.5">
            <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">官方说明</h3>
            {view.body.map((row, index) => (
              <p
                key={`${index}-${row.slice(0, 12)}`}
                className="mb-1.5 text-[13px] leading-[1.65] whitespace-pre-wrap text-[#333840]"
              >
                {row || ' '}
              </p>
            ))}
          </section>

          <p className="mt-3">
            <a href={view.docUrl} target="_blank" rel="noreferrer">
              官方配置文档 ↗
            </a>
          </p>
        </div>
      </div>
    </aside>
  );
}
