import { Callout } from '@/components/callout';
import { type FlowRow, GraphFlow } from '@/components/graph-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import registry from '@/data/configurator.json';
import { formatVersionLabel, RELEASES } from '@/lib/dict';

import { StepHeader } from './StepHeader';

interface VersionStepProps {
  line: string;
  onChange: (line: string) => void;
}

const items = [...RELEASES].reverse().map((release) => ({
  value: release.line,
  label: formatVersionLabel(release),
}));

const meta = registry.sections.__version__;

export function VersionStep({ line, onChange }: VersionStepProps) {
  const selected = RELEASES.find((release) => release.line === line);
  const flowRows: FlowRow[] = [RELEASES.slice(0, 5), RELEASES.slice(5)].map((group) => ({
    nodes: group.map((release) => ({
      label: release.line,
      tone: release.line === line ? ('accent' as const) : ('default' as const),
    })),
  }));

  return (
    <div className="max-w-3xl space-y-6">
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
    </div>
  );
}
