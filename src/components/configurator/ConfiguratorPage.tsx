import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type {
  ClusterAnswers,
  ConfiguratorDraft,
  ConfiguratorStep,
  ReplicaSentinelAnswers,
  ScenarioAnswers,
  ScenarioChecklistItem,
  ScenarioFileView,
  ScenarioId,
  ScenarioState,
} from '@/types';

import { RepoLink } from '@/components/RepoLink';
import { Button } from '@/components/ui/button';
import { useVersionData } from '@/hooks/useVersionData';
import { buildSteps, changeCount, emptyDraft, renderConfig } from '@/lib/configurator';
import { clearDraft, loadDraft, loadDraftLine, saveDraft, saveDraftLine } from '@/lib/configuratorState';
import { DEFAULT_VERSION } from '@/lib/dict';
import { setPendingConf, takePendingLine } from '@/lib/handoff';
import {
  applyCluster,
  applyReplication,
  applyScenario,
  CLUSTER_ID,
  clusterChecklist,
  clusterStepReady,
  emptyClusterAnswers,
  emptyReplicationAnswers,
  emptyScenarioAnswers,
  renderSentinelConfig,
  REPLICA_SENTINEL_ID,
  replicationStepReady,
  SCENARIO_ID,
  scenarioChecklist,
  scenarioReview,
  scenarioStepReady,
} from '@/lib/scenario';
import { replaceSecrets } from '@/lib/secrets';

import { FinishStep } from './FinishStep';
import { RegionStep } from './RegionStep';
import { ScenarioStep } from './ScenarioStep';
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

function createScenarioState(id: ScenarioId): ScenarioState {
  if (id === REPLICA_SENTINEL_ID) {
    return { id: REPLICA_SENTINEL_ID, answers: emptyReplicationAnswers(), applied: {}, nodes: [] };
  }
  if (id === CLUSTER_ID) {
    return { id: CLUSTER_ID, answers: emptyClusterAnswers(), applied: {}, nodes: [] };
  }
  return { id: SCENARIO_ID, answers: emptyScenarioAnswers(), applied: {} };
}

function generateStepIdFor(id: ScenarioId | undefined): string {
  if (id === REPLICA_SENTINEL_ID) {
    return '__repl_network__';
  }
  if (id === CLUSTER_ID) {
    return '__cluster_network__';
  }
  return '__scenario_access__';
}

function checklistFor(scenario: ConfiguratorDraft['scenario']): ScenarioChecklistItem[] | undefined {
  if (!scenario) {
    return undefined;
  }
  if (scenario.id === CLUSTER_ID) {
    return clusterChecklist(scenario.answers as ClusterAnswers);
  }
  return scenarioChecklist(scenario.id);
}

export function ConfiguratorPage() {
  const navigate = useNavigate();
  const [line, setLine] = useState(() => takePendingLine() ?? loadDraftLine() ?? DEFAULT_VERSION);
  const [draft, setDraft] = useState<ConfiguratorDraft>(() => loadDraft(line) ?? emptyDraft(line));
  const [stepIndex, setStepIndex] = useState(0);
  const { data, error } = useVersionData(line);

  const scenarioMode = draft.scenario !== undefined;
  const scenarioId = draft.scenario?.id;
  const steps = useMemo(
    () => (data ? buildSteps(data.dict, { scenario: scenarioMode, scenarioId }) : []),
    [data, scenarioMode, scenarioId],
  );
  const counts = useMemo(() => steps.map((step) => stepCount(step, draft)), [steps, draft]);
  const step = steps[stepIndex];
  const generated = useMemo(() => (data ? renderConfig(data.official, data.dict, draft) : ''), [data, draft]);
  const hasSecret = useMemo(() => {
    if (!data) {
      return false;
    }
    const sensitive = new Set(
      data.dict.directives.filter((directive) => directive.sensitive).map((directive) => directive.name),
    );
    return Object.keys(draft.values).some((name) => sensitive.has(name)) || draft.user.some((row) => row.trim() !== '');
  }, [data, draft]);

  const updateDraft = (patch: Partial<ConfiguratorDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (data) {
      saveDraft(next, data.dict);
    }
  };

  const changeLine = (next: string) => {
    clearDraft();
    saveDraftLine(next);
    setLine(next);
    setDraft(emptyDraft(next));
    setStepIndex(0);
  };

  const startScenario = (id: ScenarioId) => {
    if (!draft.scenario) {
      updateDraft({ scenario: createScenarioState(id) });
    }
    setStepIndex(1);
  };

  const answerChange = (patch: Partial<ClusterAnswers | ScenarioAnswers | ReplicaSentinelAnswers>) => {
    if (!draft.scenario) {
      return;
    }
    updateDraft({ scenario: { ...draft.scenario, answers: { ...draft.scenario.answers, ...patch } } });
  };

  const generate = () => {
    if (!data || !draft.scenario) {
      return;
    }
    const scenario = draft.scenario;
    const merged = { ...draft.values };
    for (const name of Object.keys(scenario.applied)) {
      delete merged[name];
    }
    if (scenario.id === REPLICA_SENTINEL_ID) {
      const { common, nodes } = applyReplication(scenario.answers as ReplicaSentinelAnswers, data.dict);
      updateDraft({ values: { ...merged, ...common }, scenario: { ...scenario, applied: common, nodes } });
    } else if (scenario.id === CLUSTER_ID) {
      const { common, nodes } = applyCluster(scenario.answers as ClusterAnswers, data.dict);
      updateDraft({ values: { ...merged, ...common }, scenario: { ...scenario, applied: common, nodes } });
    } else {
      const { values } = applyScenario(scenario.answers as ScenarioAnswers, data.dict);
      updateDraft({ values: { ...merged, ...values }, scenario: { ...scenario, applied: values } });
    }
    setStepIndex(steps.length - 1);
  };

  const isReplScenario = scenarioId === REPLICA_SENTINEL_ID;
  const isClusterScenario = scenarioId === CLUSTER_ID;
  const isScenarioStep = step?.kind === 'scenario';
  const generateStepId = generateStepIdFor(scenarioId);
  const passwordMissing =
    scenarioMode &&
    draft.scenario !== undefined &&
    draft.scenario.answers.access !== 'local' &&
    draft.values.requirepass === undefined;
  const review = useMemo(
    () => (data && scenarioMode ? scenarioReview(draft, data.dict) : []),
    [data, draft, scenarioMode],
  );
  const checklist = checklistFor(draft.scenario);
  const files = useMemo<ScenarioFileView[] | undefined>(() => {
    if (!data || !scenarioMode || !draft.scenario) {
      return;
    }
    const nodes = draft.scenario.nodes ?? [];
    if (nodes.length === 0) {
      return;
    }
    const answers = draft.scenario.answers as ReplicaSentinelAnswers;
    const redisFiles: ScenarioFileView[] = nodes
      .filter((node) => node.kind === 'redis')
      .map((node) => ({
        role: node.role,
        title: node.title,
        fileName: node.fileName,
        text: renderConfig(data.official, data.dict, {
          ...draft,
          values: { ...draft.values, ...node.values },
        }),
      }));
    const sentinelFiles: ScenarioFileView[] =
      draft.scenario.id === REPLICA_SENTINEL_ID
        ? nodes
            .filter((node) => node.kind === 'sentinel')
            .map((node, index) => ({
              role: node.role,
              title: node.title,
              fileName: node.fileName,
              text: renderSentinelConfig(answers, index),
            }))
        : [];
    return [...redisFiles, ...sentinelFiles];
  }, [data, draft, scenarioMode]);
  const stepReady = (): boolean => {
    if (!draft.scenario) {
      return true;
    }
    if (isClusterScenario) {
      return clusterStepReady(step?.id ?? '', draft.scenario.answers as ClusterAnswers);
    }
    return isReplScenario
      ? replicationStepReady(step?.id ?? '', draft.scenario.answers as ReplicaSentinelAnswers)
      : scenarioStepReady(step?.id ?? '', draft.scenario.answers as ScenarioAnswers);
  };
  const nextDisabled = stepIndex >= steps.length - 1 || (isScenarioStep && !stepReady());
  const onNext = () => {
    if (step?.id === generateStepId) {
      generate();
      return;
    }
    setStepIndex((value) => value + 1);
  };

  const firstSectionIndex = Math.max(
    1,
    steps.findIndex((item) => item.kind === 'section' || item.kind === 'extra'),
  );

  const download = (file?: ScenarioFileView) => {
    const warnings: string[] = [];
    if (hasSecret) {
      warnings.push('导出的文件将包含明文密码');
    }
    if (passwordMissing) {
      warnings.push('密码未填，当前配置将无认证');
    }
    if (warnings.length > 0 && !window.confirm(`${warnings.join('；')}，确认继续？`)) {
      return;
    }
    const blob = new Blob([file?.text ?? generated], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file?.fileName ?? `redis-${line}.conf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handoff = () => {
    const { text, vault } = replaceSecrets(generated);
    setPendingConf({ line, text, vault });
    navigate('/');
  };

  const stepBody = (() => {
    if (!step || !data) {
      return null;
    }
    const ordinal = String(stepIndex + 1).padStart(2, '0');
    if (step.kind === 'version') {
      return (
        <VersionStep
          line={line}
          onChange={changeLine}
          scenarioActive={scenarioMode}
          activeScenarioId={scenarioId}
          onStartScenario={startScenario}
          onItemized={() => setStepIndex(firstSectionIndex)}
        />
      );
    }
    if (step.kind === 'scenario') {
      return (
        <ScenarioStep
          stepId={step.id}
          scenarioId={draft.scenario?.id ?? SCENARIO_ID}
          answers={draft.scenario?.answers ?? emptyScenarioAnswers()}
          onChange={answerChange}
        />
      );
    }
    if (step.kind === 'finish') {
      return (
        <FinishStep
          line={line}
          text={generated}
          changed={changeCount(draft)}
          hasSecret={hasSecret}
          ordinal={ordinal}
          onBack={() => setStepIndex((value) => value - 1)}
          onDownload={download}
          onHandoff={handoff}
          review={scenarioMode ? review : undefined}
          checklist={checklist}
          passwordMissing={passwordMissing}
          files={files}
          onJumpSection={(sectionId) => setStepIndex(steps.findIndex((item) => item.id === sectionId))}
        />
      );
    }
    return (
      <RegionStep step={step} official={data.official} draft={draft} onDraftChange={updateDraft} ordinal={ordinal} />
    );
  })();

  return (
    <main className="flex h-full min-w-[1024px] flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3.5 py-2.5">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[15px] font-semibold leading-5 tracking-[0.02em]">生成配置</h1>
          <span className="text-[13px] leading-5 text-muted-foreground">当前版本 {line}</span>
        </div>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-2 self-center">
          <Button variant="outline" onClick={() => navigate('/')}>
            返回体检
          </Button>

          <span aria-hidden="true" className="select-none text-[13px] leading-none text-muted-foreground/50">
            |
          </span>
          <RepoLink />
        </span>
      </header>

      {error ? (
        <div className="border-b border-[#fed7aa] bg-[#fff7ed] px-3.5 py-1.5 text-[13px] text-[#9a3412]">
          字典加载失败：{error}
        </div>
      ) : null}

      {data ? (
        <div className="flex min-h-0 flex-1">
          <StepNav steps={steps} activeIndex={stepIndex} counts={counts} onSelect={setStepIndex} />
          <section className="min-w-0 flex-1 overflow-auto bg-white px-8 py-6" aria-label="当前步骤">
            {stepBody}
          </section>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          正在加载 {line} 的配置项字典…
        </div>
      )}

      <footer className="flex items-center gap-2 border-t border-line bg-panel px-3.5 py-2">
        <span className="text-[13px] text-muted-foreground">已改 {changeCount(draft)} 项</span>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)}>
            上一步
          </Button>
          <Button variant="outline" disabled={nextDisabled} onClick={onNext}>
            {step?.id === generateStepId ? '生成配置' : '下一步'}
          </Button>
        </div>
      </footer>
    </main>
  );
}
