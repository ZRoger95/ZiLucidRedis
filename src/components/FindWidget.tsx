import type { KeyboardEvent, RefObject } from 'react';

import { ChevronDown, ChevronUp, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { FindOptions } from '../lib/find';

import { cn } from '../lib/utils';

export interface FindWidgetProps {
  open: boolean;
  query: string;
  options: FindOptions;
  matchCount: number;
  activeIndex: number;
  invalid: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onOptionsChange: (next: FindOptions) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  label: string;
}

export function FindWidget({
  open,
  query,
  options,
  matchCount,
  activeIndex,
  invalid,
  inputRef,
  onQueryChange,
  onOptionsChange,
  onNext,
  onPrev,
  onClose,
  label,
}: FindWidgetProps) {
  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
      return;
    }
    if (!event.altKey) {
      return;
    }
    if (event.code === 'KeyC') {
      event.preventDefault();
      onOptionsChange({ ...options, caseSensitive: !options.caseSensitive });
    } else if (event.code === 'KeyW') {
      event.preventDefault();
      onOptionsChange({ ...options, wholeWord: !options.wholeWord });
    } else if (event.code === 'KeyR') {
      event.preventDefault();
      onOptionsChange({ ...options, regexp: !options.regexp });
    }
  };

  let countText = '';
  if (invalid) {
    countText = '正则无效';
  } else if (query !== '') {
    countText = `${matchCount === 0 ? 0 : activeIndex + 1}/${matchCount}`;
  }
  const toggleClass = (active: boolean) => cn('font-mono text-xs', active && 'bg-accent text-ink');

  return (
    <div
      role="search"
      aria-label={label}
      className="absolute top-2 right-3 z-20 flex items-center gap-1 rounded-md border border-line bg-white p-1 shadow-lg"
    >
      <Input
        ref={inputRef}
        type="search"
        aria-label={label}
        aria-invalid={invalid}
        placeholder="查找"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 w-52 text-[13px] [&::-webkit-search-cancel-button]:hidden"
      />
      <span aria-live="polite" className="min-w-14 text-right text-xs text-muted-foreground">
        {countText}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="上一个"
        disabled={matchCount === 0}
        onClick={onPrev}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="下一个"
        disabled={matchCount === 0}
        onClick={onNext}
      >
        <ChevronDown />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="区分大小写"
        aria-pressed={options.caseSensitive}
        onClick={() => onOptionsChange({ ...options, caseSensitive: !options.caseSensitive })}
        className={toggleClass(options.caseSensitive)}
      >
        Aa
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="全词匹配"
        aria-pressed={options.wholeWord}
        onClick={() => onOptionsChange({ ...options, wholeWord: !options.wholeWord })}
        className={toggleClass(options.wholeWord)}
      >
        ab|
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="正则表达式"
        aria-pressed={options.regexp}
        onClick={() => onOptionsChange({ ...options, regexp: !options.regexp })}
        className={toggleClass(options.regexp)}
      >
        .*
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="关闭查找" onClick={onClose}>
        <X />
      </Button>
    </div>
  );
}
