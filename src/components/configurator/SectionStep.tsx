import { useMemo } from 'react';

import type { ConfiguratorDraft, ConfiguratorStep } from '@/types';

import registry from '@/data/configurator.json';
import { sectionComment } from '@/lib/configurator';

import { DirectiveField } from './DirectiveField';
import { FreeLinesEditor } from './FreeLinesEditor';

interface SectionStepProps {
  step: ConfiguratorStep;
  official: string;
  draft: ConfiguratorDraft;
  onDraftChange: (patch: Partial<ConfiguratorDraft>) => void;
}

export function SectionStep({ step, official, draft, onDraftChange }: SectionStepProps) {
  const meta = registry.sections[step.id as keyof typeof registry.sections];
  const comment = useMemo(() => sectionComment(official, step.id), [official, step.id]);
  const twoColumns = step.directives.length > 10;

  const setValue = (name: string, value: string | null) => {
    const values = { ...draft.values };
    if (value === null) {
      delete values[name];
    } else {
      values[name] = value;
    }
    onDraftChange({ values });
  };

  return (
    <div className="max-w-4xl space-y-5">
      <header className="space-y-1">
        <h2 className="m-0 font-mono text-[18px] font-semibold text-ink">{step.title}</h2>
        <p className="m-0 text-[13px] text-muted-foreground">{meta ? `${meta.name} · ${meta.summary}` : '官方区域'}</p>
      </header>

      {comment.length > 0 ? (
        <details className="rounded-md border border-line bg-[#fbfbfc] px-3 py-2 text-[12px] text-muted-foreground">
          <summary className="cursor-pointer text-[12px] text-ink">官方说明</summary>
          <pre className="mt-2 mb-0 overflow-x-auto font-sans whitespace-pre-wrap">{comment.join('\n')}</pre>
        </details>
      ) : null}

      {step.directives.length > 0 ? (
        <div className={twoColumns ? 'grid grid-cols-1 gap-x-8 lg:grid-cols-2' : 'grid grid-cols-1'}>
          {step.directives.map((doc) => (
            <DirectiveField
              key={doc.name}
              doc={doc}
              value={draft.values[doc.name]}
              changed={draft.values[doc.name] !== undefined}
              onChange={(value) => setValue(doc.name, value)}
            />
          ))}
        </div>
      ) : (
        <p className="m-0 text-[13px] text-muted-foreground">本区域没有需要填写的指令。</p>
      )}

      {step.freeLines.map((kind) => (
        <FreeLinesEditor key={kind} kind={kind} draft={draft} onChange={onDraftChange} />
      ))}
    </div>
  );
}
