import type { ConfiguratorDraft, FreeLineKind } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const TITLES: Record<FreeLineKind, string> = {
  include: 'include 路径',
  loadmodule: 'loadmodule 路径',
  user: 'ACL 用户规则',
  renameCommand: 'rename-command',
};

interface FreeLinesEditorProps {
  kind: FreeLineKind;
  draft: ConfiguratorDraft;
  onChange: (patch: Partial<ConfiguratorDraft>) => void;
}

export function FreeLinesEditor({ kind, draft, onChange }: FreeLinesEditorProps) {
  const title = <h3 className="m-0 text-[13px] font-semibold text-ink">{TITLES[kind]}</h3>;

  if (kind === 'renameCommand') {
    const rows = draft.renameCommand;
    const update = (index: number, patch: Partial<{ command: string; target: string }>) => {
      onChange({ renameCommand: rows.map((row, current) => (current === index ? { ...row, ...patch } : row)) });
    };
    return (
      <section className="space-y-2 border-t border-line pt-4">
        {title}
        <p className="m-0 text-[12px] text-muted-foreground">新名留空表示禁用该命令。</p>
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`命令 ${index + 1}`}
              className="w-56 font-mono"
              placeholder="CONFIG"
              value={row.command}
              onChange={(event) => update(index, { command: event.target.value })}
            />
            <Input
              aria-label={`新名 ${index + 1}`}
              className="w-56 font-mono"
              placeholder="留空表示禁用"
              value={row.target}
              onChange={(event) => update(index, { target: event.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ renameCommand: rows.filter((_, current) => current !== index) })}
            >
              删除
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ renameCommand: [...rows, { command: '', target: '' }] })}
        >
          添加一行
        </Button>
      </section>
    );
  }

  if (kind === 'user') {
    const rows = draft.user;
    return (
      <section className="space-y-2 border-t border-line pt-4">
        {title}
        <p className="m-0 text-[12px] text-muted-foreground">
          ACL 用户行不落盘，刷新后需要整行重新填写；带回编辑器时密码会替换成占位符。
        </p>
        <Textarea
          aria-label="ACL 用户规则"
          className="font-mono"
          rows={4}
          placeholder="user alice on ~* +@all >password"
          value={rows.join('\n')}
          onChange={(event) => onChange({ user: event.target.value.split('\n') })}
        />
      </section>
    );
  }

  const rows = kind === 'include' ? draft.include : draft.loadmodule;
  const setRows = (next: string[]) => onChange(kind === 'include' ? { include: next } : { loadmodule: next });

  return (
    <section className="space-y-2 border-t border-line pt-4">
      {title}
      <p className="m-0 text-[12px] text-muted-foreground">
        {kind === 'include' ? '支持通配符，按官方建议输出在配置文件靠前位置。' : '每行一个模块，可带启动参数。'}
      </p>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={`路径 ${index + 1}`}
            className="w-[32rem] font-mono"
            placeholder={kind === 'include' ? '/etc/redis/*.conf' : '/path/to/module.so'}
            value={row}
            onChange={(event) => setRows(rows.map((item, current) => (current === index ? event.target.value : item)))}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows(rows.filter((_, current) => current !== index))}
          >
            删除
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, ''])}>
        添加一行
      </Button>
    </section>
  );
}
