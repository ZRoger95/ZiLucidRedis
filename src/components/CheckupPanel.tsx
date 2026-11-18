import { type ReactNode, useState } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { RiskWarning } from '../types';

import { CHECKUP_KIND_LABELS, type CheckupGroup, type CheckupItem, type CheckupKind } from '../lib/checkup';
import { cn } from '../lib/utils';

interface CheckupPanelProps {
  groups: CheckupGroup[];
  hasContent: boolean;
  onJump: (lineNo: number) => void;
  onInsertMissing: (name: string) => void;
}

type CheckupFilter = 'all' | CheckupKind;

const FILTER_ORDER: CheckupKind[] = ['warning', 'missing', 'changed', 'unknown', 'removed', 'newer', 'duplicate'];

const LEVEL_SHORT: Record<RiskWarning['level'], string> = { high: '高危', medium: '中危', low: '提示' };

const LEVEL_CLASS: Record<RiskWarning['level'], string> = {
  high: 'font-semibold text-unknown',
  medium: 'text-warning',
  low: 'text-muted-foreground',
};

function ItemBody({ item }: { item: CheckupItem }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {item.level ? <span className={LEVEL_CLASS[item.level]}>{LEVEL_SHORT[item.level]}</span> : null}
      <span className={cn('font-mono', item.kind === 'missing' && 'text-unknown')}>{item.label}</span>
      {item.detail ? <span className="text-xs text-muted-foreground">{item.detail}</span> : null}
      {item.lineNo !== null ? <span className="text-xs text-muted-foreground">第 {item.lineNo} 行</span> : null}
    </span>
  );
}

function GroupSection({
  group,
  onJump,
  onInsertMissing,
}: {
  group: CheckupGroup;
  onJump: (lineNo: number) => void;
  onInsertMissing: (name: string) => void;
}) {
  return (
    <section className="border-b border-[#f2f3f5] last:border-b-0">
      <div className="flex items-baseline gap-2 px-3.5 pt-2 pb-1 text-xs text-muted-foreground">
        <strong className="text-[12px] text-ink">{group.label}</strong>
        <span>{group.items.length}</span>
      </div>
      <ul aria-label={group.label} className="m-0 list-none px-3.5 pb-1.5">
        {group.items.map((item) => {
          const lineNo = item.lineNo;
          const content = <ItemBody item={item} />;
          let row: ReactNode;
          if (lineNo !== null) {
            row = (
              <button
                type="button"
                className="w-full cursor-pointer border-0 bg-transparent p-0 text-left hover:text-[#4f46e5]"
                onClick={() => onJump(lineNo)}
              >
                {content}
              </button>
            );
          } else if (item.kind === 'missing') {
            row = (
              <button
                type="button"
                className="w-full cursor-pointer border-0 bg-transparent p-0 text-left hover:text-[#4f46e5]"
                onClick={() => onInsertMissing(item.label)}
              >
                {content}
              </button>
            );
          } else {
            row = <div>{content}</div>;
          }
          return (
            <li key={item.id} className="py-0.5 text-[13px]">
              {row}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CheckupPanel({ groups, hasContent, onJump, onInsertMissing }: CheckupPanelProps) {
  const [filter, setFilter] = useState<CheckupFilter>('all');

  const total = hasContent ? groups.reduce((sum, group) => sum + group.items.length, 0) : 0;
  const visible = filter === 'all' ? groups : groups.filter((group) => group.kind === filter);

  let body;
  if (!hasContent) {
    body = <p className="m-0 px-3.5 py-3 text-[13px] text-muted-foreground">先在左侧载入或粘贴配置</p>;
  } else if (total === 0) {
    body = <p className="m-0 px-3.5 py-3 text-[13px] text-muted-foreground">当前配置没发现问题</p>;
  } else if (visible.length === 0) {
    body = <p className="m-0 px-3.5 py-3 text-[13px] text-muted-foreground">该类别没有问题</p>;
  } else {
    body = visible.map((group) => (
      <GroupSection key={group.kind} group={group} onJump={onJump} onInsertMissing={onInsertMissing} />
    ));
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-white" aria-label="体检结果">
      <div className="flex items-center gap-2 px-3.5 pt-2 pb-1.5">
        <Select value={filter} onValueChange={(value) => setFilter(value as CheckupFilter)}>
          <SelectTrigger size="sm" aria-label="体检结果筛选" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {FILTER_ORDER.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {CHECKUP_KIND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">共 {total} 项</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </section>
  );
}
