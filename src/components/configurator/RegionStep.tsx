import { useMemo } from 'react';

import type { ConfiguratorDraft, ConfiguratorStep } from '@/types';

import registry from '@/data/configurator.json';
import { sectionComment } from '@/lib/configurator';

import { DirectiveField } from './DirectiveField';
import { FreeLinesEditor } from './FreeLinesEditor';
import { REGION_INTROS } from './regionIntros';
import { StepHeader } from './StepHeader';

interface RegionStepProps {
  step: ConfiguratorStep;
  official: string;
  draft: ConfiguratorDraft;
  onDraftChange: (patch: Partial<ConfiguratorDraft>) => void;
  ordinal: string;
}

export function RegionStep({ step, official, draft, onDraftChange, ordinal }: RegionStepProps) {
  const meta = registry.sections[step.id as keyof typeof registry.sections];
  const comment = useMemo(() => sectionComment(official, step.id), [official, step.id]);

  const setValue = (name: string, value: string | null) => {
    const values = { ...draft.values };
    if (value === null) {
      delete values[name];
    } else {
      values[name] = value;
    }
    onDraftChange({ values });
  };

  const originOf = (name: string): 'scenario' | 'modified' | undefined => {
    const preset = draft.scenario?.applied[name];
    const current = draft.values[name];
    if (preset === undefined || current === undefined) {
      return undefined;
    }
    return current === preset ? 'scenario' : 'modified';
  };

  const fieldHeavy = step.directives.length > 0;

  const intro = (
    <>
      {REGION_INTROS[step.id]}
      {comment.length > 0 ? (
        <details className="rounded-md border border-line bg-[#fbfbfc] px-3 py-2 text-[12px] text-muted-foreground">
          <summary className="cursor-pointer text-[12px] text-ink">官方说明</summary>
          <pre className="mt-2 mb-0 overflow-x-auto font-sans whitespace-pre-wrap">{comment.join('\n')}</pre>
        </details>
      ) : null}
    </>
  );

  const fields = (
    <>
      {step.directives.length > 0 ? (
        <div
          className={step.directives.length > 10 ? 'grid grid-cols-1 gap-x-8 @[50rem]:grid-cols-2' : 'grid grid-cols-1'}
        >
          {step.directives.map((doc) => (
            <DirectiveField
              key={doc.name}
              doc={doc}
              value={draft.values[doc.name]}
              changed={draft.values[doc.name] !== undefined}
              onChange={(value) => setValue(doc.name, value)}
              origin={originOf(doc.name)}
            />
          ))}
        </div>
      ) : null}

      {step.directives.length === 0 && step.freeLines.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">本区域没有需要填写的指令。</p>
      ) : null}

      {step.freeLines.map((kind) => (
        <FreeLinesEditor key={kind} kind={kind} draft={draft} onChange={onDraftChange} />
      ))}
    </>
  );

  return (
    <div className={fieldHeavy ? 'max-w-6xl space-y-6' : 'max-w-3xl space-y-6'}>
      <StepHeader
        crumb={`~/configurator · ${ordinal} · ${step.title}`}
        title={meta ? meta.name : step.title}
        summary={meta ? meta.summary : '官方区域'}
        figure={meta?.figure}
      />

      {fieldHeavy ? (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="@container min-w-0 space-y-5">{fields}</div>
          <div className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:self-start">{intro}</div>
        </div>
      ) : (
        <>
          {intro}
          {fields}
        </>
      )}
    </div>
  );
}
