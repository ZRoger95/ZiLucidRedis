import type { DirectiveDoc } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import registry from '@/data/configurator.json';
import zhNotes from '@/data/zh-notes.json';

const notes = zhNotes as Record<string, string>;

interface DirectiveFieldProps {
  doc: DirectiveDoc;
  value: string | undefined;
  changed: boolean;
  onChange: (value: string | null) => void;
}

export function DirectiveField({ doc, value, changed, onChange }: DirectiveFieldProps) {
  const id = `field-${doc.name}`;
  const options = (registry.enums as Record<string, string[]>)[doc.name] ?? [];
  const note = notes[doc.name] ?? doc.comment[0] ?? '';

  const control = (() => {
    if (doc.type === 'bool') {
      return (
        <Switch
          id={id}
          aria-label={doc.name}
          checked={(value ?? doc.defaultValue ?? 'no') === 'yes'}
          onCheckedChange={(checked) => onChange(checked ? 'yes' : 'no')}
        />
      );
    }
    if (doc.type === 'special') {
      return (
        <Textarea
          id={id}
          aria-label={doc.name}
          className="font-mono"
          rows={3}
          value={value ?? ''}
          placeholder={doc.defaultValue ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        />
      );
    }
    return (
      <>
        <Input
          id={id}
          aria-label={doc.name}
          className="font-mono"
          type={doc.sensitive ? 'password' : 'text'}
          list={options.length > 0 ? `${id}-options` : undefined}
          value={value ?? ''}
          placeholder={doc.defaultValue ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        />
        {options.length > 0 ? (
          <datalist id={`${id}-options`}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        ) : null}
      </>
    );
  })();

  return (
    <div className="grid gap-1.5 border-b border-dashed border-line/70 py-2.5">
      <div className="flex items-baseline gap-2">
        <label htmlFor={id} className="font-mono text-[13px] font-medium text-ink">
          {doc.name}
        </label>
        <span className="text-[11px] text-muted-foreground">
          默认 {doc.defaultValue === '' ? '（空）' : (doc.defaultValue ?? '—')}
        </span>
        {doc.range ? <span className="text-[11px] text-muted-foreground">范围 {doc.range}</span> : null}
        {doc.modifiable ? null : <span className="text-[11px] text-[#9a3412]">需重启生效</span>}
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="xs" disabled={!changed} onClick={() => onChange(null)}>
          恢复默认
        </Button>
      </div>
      {note ? <p className="m-0 text-[12px] leading-5 text-muted-foreground">{note}</p> : null}
      {control}
      {doc.sensitive ? <p className="m-0 text-[11px] text-[#9a3412]">敏感值不保存，刷新后需重新填写。</p> : null}
    </div>
  );
}
