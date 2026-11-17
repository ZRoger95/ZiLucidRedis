import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@ui-sdk/react/command';
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog';
import { useMemo, useState } from 'react';

import type { DictFile } from '../types';

import { searchDirectives } from '../lib/search';

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dict: DictFile | null;
  configured: Set<string>;
  onPick: (name: string, exists: boolean) => void;
}

export function SearchPalette({ open, onOpenChange, dict, configured, onPick }: SearchPaletteProps) {
  const [query, setQuery] = useState('');

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('');
    }
    onOpenChange(next);
  };

  const hits = useMemo(() => (dict ? searchDirectives(dict, query, configured) : []), [dict, query, configured]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogBackdrop />
      <DialogContent className="palette-dialog">
        <DialogTitle>搜索配置项</DialogTitle>
        <Command
          filter={false}
          query={query}
          onQueryChange={setQuery}
          onAction={(value) => {
            const hit = hits.find((item) => item.name === value);
            if (!hit) {
              return;
            }
            onPick(hit.name, hit.configured);
            handleOpenChange(false);
          }}
        >
          <CommandInput aria-label="搜索配置项" placeholder="输入指令名、分组或中文说明，例如 maxmemory" />
          <CommandEmpty>没有匹配的配置项。</CommandEmpty>
          <CommandList className="palette-list">
            {hits.map((hit) => (
              <CommandItem key={hit.name} value={hit.name} label={hit.name}>
                <span className="palette-hit">
                  <span className="name">
                    {hit.name}
                    {hit.configured ? ' · 已配置' : ''}
                  </span>
                  <span className="value">默认 {hit.defaultValue === null ? '未给出' : hit.defaultValue || '空'}</span>
                  <span className="hint">{hit.summary ?? hit.section}</span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
