import { useMemo, useState } from 'react';

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

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
      <DialogContent className="w-[min(680px,90vw)] sm:max-w-[680px]">
        <DialogTitle>搜索配置项</DialogTitle>
        <Command shouldFilter={false} className="mt-2">
          <CommandInput
            aria-label="搜索配置项"
            placeholder="输入指令名、分组或中文说明，例如 maxmemory"
            value={query}
            onValueChange={setQuery}
          />
          <CommandEmpty>没有匹配的配置项。</CommandEmpty>
          <CommandList className="max-h-[min(56vh,520px)]">
            {hits.map((hit) => (
              <CommandItem
                key={hit.name}
                value={hit.name}
                onSelect={() => {
                  onPick(hit.name, hit.configured);
                  handleOpenChange(false);
                }}
              >
                <span className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5">
                  <span className="font-mono text-[13px]">
                    {hit.name}
                    {hit.configured ? ' · 已配置' : ''}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    默认 {hit.defaultValue === null ? '未给出' : hit.defaultValue || '空'}
                  </span>
                  <span className="text-xs text-muted-foreground">{hit.summary ?? hit.section}</span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
