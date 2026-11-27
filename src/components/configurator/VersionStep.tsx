import type { ScenarioId } from '@/types';

import { Callout } from '@/components/callout';
import { type FlowRow, GraphFlow } from '@/components/graph-flow';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import registry from '@/data/configurator.json';
import { formatVersionLabel, RELEASES } from '@/lib/dict';
import { CLUSTER_ID, REPLICA_SENTINEL_ID, SCENARIO_ID } from '@/lib/scenario';

import { StepHeader } from './StepHeader';

interface VersionStepProps {
  line: string;
  onChange: (line: string) => void;
  scenarioActive: boolean;
  activeScenarioId?: ScenarioId;
  onStartScenario: (id: ScenarioId) => void;
  onItemized: () => void;
}

const SCENARIO_ENTRIES: Array<{ id: ScenarioId; label: string }> = [
  { id: SCENARIO_ID, label: '单机单实例' },
  { id: REPLICA_SENTINEL_ID, label: '一主二从三哨兵' },
  { id: CLUSTER_ID, label: '三主三从集群' },
];

const items = [...RELEASES].reverse().map((release) => ({
  value: release.line,
  label: formatVersionLabel(release),
}));

const meta = registry.sections.__version__;

export function VersionStep({
  line,
  onChange,
  scenarioActive,
  activeScenarioId,
  onStartScenario,
  onItemized,
}: VersionStepProps) {
  const selected = RELEASES.find((release) => release.line === line);
  const flowRows: FlowRow[] = [RELEASES.slice(0, 5), RELEASES.slice(5)].map((group) => ({
    nodes: group.map((release) => ({
      label: release.line,
      tone: release.line === line ? ('accent' as const) : ('default' as const),
    })),
  }));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <StepHeader
        crumb={`~/configurator · 01 · ${RELEASES.length} 个版本`}
        title={meta.name}
        summary={`${meta.summary}；未改动的行保持官方注释原样，改过的指令会取消注释并写入新值。`}
        figure={meta.figure}
      />

      <div className="space-y-2">
        <GraphFlow title="REDIS 版本线" rows={flowRows} />
        {selected ? (
          <p className="m-0 font-mono text-[12px] text-muted-foreground">
            当前所选 {selected.line} · 最新补丁 {selected.tag} · 发布于 {selected.publishedAt.slice(0, 10)}
          </p>
        ) : null}
      </div>

      <Callout type="warning" title="注意">
        <p>切换版本会清空当前草稿。</p>
      </Callout>

      <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
        <span>版本</span>
        <Select value={line} onValueChange={onChange}>
          <SelectTrigger aria-label="选择 Redis 版本" className="w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {SCENARIO_ENTRIES.map((entry) => (
            <Button
              key={entry.id}
              variant={scenarioActive && activeScenarioId === entry.id ? 'default' : 'outline'}
              onClick={() => onStartScenario(entry.id)}
            >
              {scenarioActive && activeScenarioId === entry.id ? '继续场景问卷' : entry.label}
            </Button>
          ))}
          <Button variant="outline" onClick={onItemized}>
            逐项配置
          </Button>
        </div>
        <p className="m-0 text-[12px] text-muted-foreground">选择场景回答对应问卷生成配置，区域步仍可逐项复查。</p>
      </div>
    </div>
  );
}
