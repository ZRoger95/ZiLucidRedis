import type { ConfiguratorStep } from '@/types';

import registry from '@/data/configurator.json';
import { cn } from '@/lib/utils';

interface StepNavProps {
  steps: ConfiguratorStep[];
  activeIndex: number;
  counts: number[];
  onSelect: (index: number) => void;
}

function stepLabel(step: ConfiguratorStep): string {
  if (step.kind === 'section' || step.kind === 'extra') {
    return registry.sections[step.id as keyof typeof registry.sections]?.name ?? step.title;
  }
  return step.title;
}

export function StepNav({ steps, activeIndex, counts, onSelect }: StepNavProps) {
  return (
    <nav
      aria-label="配置步骤"
      className="w-[220px] min-h-0 shrink-0 overflow-auto border-r border-line bg-[#fbfbfc] py-2"
    >
      <ol className="m-0 list-none p-0">
        {steps.map((step, index) => {
          const active = index === activeIndex;
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(index)}
                className={cn(
                  'flex w-full items-center gap-2 border-l-2 px-3.5 py-1.5 text-left text-[13px] transition-colors',
                  active
                    ? 'border-l-[#2563eb] bg-white font-semibold text-ink shadow-[inset_0_0_0_1px_#e5e7eb]'
                    : 'border-l-transparent text-muted-foreground hover:bg-white/70',
                )}
              >
                <span className="w-6 shrink-0 font-mono text-[11px] text-[#9ca3af]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate">{stepLabel(step)}</span>
                {counts[index] ? (
                  <span className="rounded-full bg-[#eef2ff] px-1.5 py-0.5 text-[11px] text-[#4338ca]">
                    {counts[index]}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
