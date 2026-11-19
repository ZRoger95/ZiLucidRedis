import { useMemo, useState } from 'react';

import type { ConfiguratorDraft, ConfiguratorStep } from '@/types';

import { Button } from '@/components/ui/button';
import registry from '@/data/configurator.json';
import { useVersionData } from '@/hooks/useVersionData';
import { buildSteps, changeCount, emptyDraft } from '@/lib/configurator';
import { DEFAULT_VERSION } from '@/lib/dict';
import { navigate } from '@/lib/routes';

import { StepNav } from './StepNav';
import { VersionStep } from './VersionStep';

function freeLineCount(step: ConfiguratorStep, draft: ConfiguratorDraft): number {
  let total = 0;
  for (const kind of step.freeLines) {
    total += kind === 'renameCommand' ? draft.renameCommand.length : draft[kind].length;
  }
  return total;
}

function stepCount(step: ConfiguratorStep, draft: ConfiguratorDraft): number {
  const values = step.directives.filter((directive) => draft.values[directive.name] !== undefined).length;
  return values + freeLineCount(step, draft);
}

export function ConfiguratorPage() {
  const [line, setLine] = useState(DEFAULT_VERSION);
  const [draft, setDraft] = useState<ConfiguratorDraft>(() => emptyDraft(DEFAULT_VERSION));
  const [stepIndex, setStepIndex] = useState(0);
  const { data, error } = useVersionData(line);

  const steps = useMemo(() => (data ? buildSteps(data.dict) : []), [data]);
  const counts = useMemo(() => steps.map((step) => stepCount(step, draft)), [steps, draft]);
  const step = steps[stepIndex];

  const changeLine = (next: string) => {
    setLine(next);
    setDraft(emptyDraft(next));
    setStepIndex(0);
  };

  const stepBody = (() => {
    if (!step) {
      return null;
    }
    if (step.kind === 'version') {
      return <VersionStep line={line} onChange={changeLine} />;
    }
    if (step.kind === 'finish') {
      return (
        <div className="max-w-2xl space-y-4">
          <h2 className="m-0 text-[18px] font-semibold text-ink">完成</h2>
          <p className="m-0 text-[13px] text-muted-foreground">共改 {changeCount(draft)} 项。</p>
        </div>
      );
    }
    const meta = registry.sections[step.id as keyof typeof registry.sections];
    return (
      <div className="max-w-3xl space-y-4">
        <h2 className="m-0 font-mono text-[18px] font-semibold text-ink">{step.title}</h2>
        <p className="m-0 text-[13px] text-muted-foreground">{meta ? `${meta.name} · ${meta.summary}` : '官方区域'}</p>
        {step.freeLines.length > 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">本区域还提供自由行编辑器。</p>
        ) : null}
        <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0 text-[13px] text-muted-foreground">
          {step.directives.map((directive) => (
            <li key={directive.name} className="font-mono">
              {directive.name}
            </li>
          ))}
        </ul>
      </div>
    );
  })();

  return (
    <main className="flex h-full min-w-[1024px] flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3.5 py-2.5">
        <h1 className="mr-3 text-[15px] font-semibold tracking-[0.02em]">生成配置</h1>
        <span className="text-[13px] text-muted-foreground">当前版本 {line}</span>
        <span className="flex-1" />
        <Button variant="outline" onClick={() => navigate('checkup')}>
          返回体检
        </Button>
      </header>

      {error ? (
        <div className="border-b border-[#fed7aa] bg-[#fff7ed] px-3.5 py-1.5 text-[13px] text-[#9a3412]">
          字典加载失败：{error}
        </div>
      ) : null}

      {data ? (
        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
          <StepNav steps={steps} activeIndex={stepIndex} counts={counts} onSelect={setStepIndex} />
          <section className="min-h-0 overflow-auto bg-white px-8 py-6" aria-label="当前步骤">
            {stepBody}
          </section>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          正在加载 {line} 的配置项字典…
        </div>
      )}

      <footer className="flex items-center gap-2 border-t border-line bg-panel px-3.5 py-2">
        <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)}>
          上一步
        </Button>
        <Button
          variant="outline"
          disabled={stepIndex >= steps.length - 1}
          onClick={() => setStepIndex((value) => value + 1)}
        >
          下一步
        </Button>
        <span className="flex-1" />
        <span className="text-[13px] text-muted-foreground">已改 {changeCount(draft)} 项</span>
      </footer>
    </main>
  );
}
