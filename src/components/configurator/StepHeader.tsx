import type { CSSProperties } from 'react';

import { FIGURES } from './figures';

interface StepHeaderProps {
  crumb: string;
  title: string;
  summary: string;
  figure?: string;
}

export function StepHeader({ crumb, title, summary, figure }: StepHeaderProps) {
  const Figure = figure ? FIGURES[figure] : undefined;

  return (
    <header>
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0 space-y-1.5">
          <p className="m-0 font-mono text-[12px] tracking-wide text-muted-foreground">{crumb}</p>
          <h2 className="m-0 text-[22px] font-semibold text-graph-accent">{title}</h2>
          <p className="m-0 max-w-[52ch] text-[13px] leading-6 text-muted-foreground">{summary}</p>
        </div>
        {Figure ? (
          <Figure
            intensity={0.4}
            theme="light"
            aria-hidden
            className="w-40 shrink-0"
            style={{ '--hairline-plate': '#ffffff' } as CSSProperties}
          />
        ) : null}
      </div>
      <div aria-hidden className="graph-rule mt-5" />
    </header>
  );
}
