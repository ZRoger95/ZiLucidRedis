import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import type { AnnotationMode, DictFile, JumpTarget } from '../types';

import { DEFAULT_FIND_OPTIONS, type FindMatch, findMatches, type FindOptions, type FindResult } from '../lib/find';
import { type OfficialAnnotation, officialAnnotations } from '../lib/official';
import { FindWidget } from './FindWidget';
import './editor.css';

interface OfficialPaneProps {
  text: string;
  tag: string;
  publishedAt?: string;
  dict: DictFile | null;
  zhNotes: Record<string, string>;
  annotationMode: AnnotationMode;
  highlightLines: Set<number>;
  focus: JumpTarget | null;
  findRequest?: number;
}

const EMPTY_FIND_RESULT: FindResult = { matches: [], error: false };

function renderRow(row: string, lineStart: number, matches: FindMatch[] | undefined, currentFrom: number): ReactNode {
  if (!matches || matches.length === 0) {
    return row || ' ';
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    const from = Math.max(0, Math.min(row.length, match.from - lineStart));
    const to = Math.max(0, Math.min(row.length, match.to - lineStart));
    if (to <= from) {
      continue;
    }
    if (from > cursor) {
      parts.push(row.slice(cursor, from));
    }
    parts.push(
      <mark
        key={`${match.from}-${match.to}`}
        className={match.from === currentFrom ? 'bg-[#f59e0b] text-inherit' : 'bg-[#fde68a] text-inherit'}
      >
        {row.slice(from, to)}
      </mark>,
    );
    cursor = to;
  }
  if (cursor < row.length) {
    parts.push(row.slice(cursor));
  }
  return parts.length === 0 ? ' ' : parts;
}

interface OfficialLineProps {
  lineNo: number;
  row: string;
  lineStart: number;
  className: string;
  annotation: OfficialAnnotation | undefined;
  matches: FindMatch[] | undefined;
  currentFrom: number;
}

export function rowCurrentFrom(matches: FindMatch[] | undefined, activeMatch: FindMatch | null): number {
  return matches && activeMatch ? activeMatch.from : -1;
}

const OfficialLine = memo(function OfficialLineView({
  lineNo,
  row,
  lineStart,
  className,
  annotation,
  matches,
  currentFrom,
}: OfficialLineProps) {
  return (
    <div>
      {annotation ? (
        <details className="annotation official-annotation">
          <summary>{annotation.summary}</summary>
          <div className="annotation-body">
            {annotation.text.slice(0, -1).map((comment, commentIndex) => (
              <div key={`${lineNo}-${commentIndex}`}>{comment || ' '}</div>
            ))}
          </div>
        </details>
      ) : null}
      <div data-official-line={lineNo} className={className}>
        <span className="w-10 flex-none select-none text-right text-[#9aa1ad]">{lineNo}</span>
        <span className="whitespace-pre">{renderRow(row, lineStart, matches, currentFrom)}</span>
      </div>
    </div>
  );
});

export function OfficialPane({
  text,
  tag,
  publishedAt,
  dict,
  zhNotes,
  annotationMode,
  highlightLines,
  focus,
  findRequest,
}: OfficialPaneProps) {
  const host = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const lastFindRequest = useRef(findRequest);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findOptions, setFindOptions] = useState<FindOptions>(DEFAULT_FIND_OPTIONS);
  const [findIndex, setFindIndex] = useState(0);

  const rows = useMemo(() => text.replace(/\r\n?/g, '\n').split('\n'), [text]);

  const lineStarts = useMemo(() => {
    const starts = [0];
    let offset = 0;
    for (const row of rows) {
      offset += row.length + 1;
      starts.push(offset);
    }
    return starts;
  }, [rows]);

  const annotations = useMemo(() => {
    if (!dict) {
      return new Map<number, OfficialAnnotation>();
    }
    return officialAnnotations(
      rows,
      new Map(dict.directives.map((directive) => [directive.name, directive])),
      annotationMode,
      zhNotes,
    );
  }, [rows, dict, annotationMode, zhNotes]);

  const findResult = useMemo(
    () => (findOpen && findQuery ? findMatches(text, findQuery, findOptions) : EMPTY_FIND_RESULT),
    [findOpen, findQuery, findOptions, text],
  );
  const matchesByLine = useMemo(() => {
    const map = new Map<number, FindMatch[]>();
    for (const match of findResult.matches) {
      const list = map.get(match.lineNo);
      if (list) {
        list.push(match);
      } else {
        map.set(match.lineNo, [match]);
      }
    }
    return map;
  }, [findResult]);
  const activeIndex =
    findResult.matches.length === 0
      ? -1
      : ((findIndex % findResult.matches.length) + findResult.matches.length) % findResult.matches.length;
  const activeMatch = activeIndex >= 0 ? findResult.matches[activeIndex] : null;

  const focusBlock = useMemo(() => {
    const block = new Set<number>();
    if (!focus) {
      return block;
    }
    let index = focus.lineNo - 2;
    while (index >= 0 && rows[index].trim().startsWith('#')) {
      block.add(index + 1);
      index -= 1;
    }
    return block;
  }, [focus, rows]);

  // 滚动位置属于 DOM 外部状态，只能在渲染提交后同步
  useEffect(() => {
    if (!focus) {
      return;
    }
    const target = host.current?.querySelector<HTMLElement>(`[data-official-line="${focus.lineNo}"]`);
    target?.scrollIntoView({ block: 'center' });
  }, [focus]);

  useEffect(() => {
    if (findRequest === undefined || lastFindRequest.current === findRequest) {
      return;
    }
    lastFindRequest.current = findRequest;
    setFindOpen(true);
  }, [findRequest]);

  useEffect(() => {
    if (!findOpen) {
      return;
    }
    findInput.current?.focus();
    findInput.current?.select();
  }, [findOpen, findRequest]);

  useEffect(() => {
    if (!activeMatch) {
      return;
    }
    const target = host.current?.querySelector<HTMLElement>(`[data-official-line="${activeMatch.lineNo}"]`);
    target?.scrollIntoView({ block: 'center' });
  }, [activeMatch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" ref={host}>
      <div className="border-b border-line bg-[#f3f4f7] px-3 py-1.5 text-xs text-muted-foreground">
        官方完整配置 · {tag}
        {publishedAt ? ` · ${publishedAt.slice(0, 10)}` : ''} · 只读
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <FindWidget
          open={findOpen}
          query={findQuery}
          options={findOptions}
          matchCount={findResult.matches.length}
          activeIndex={activeIndex}
          invalid={findResult.error}
          inputRef={findInput}
          onQueryChange={(value) => {
            setFindQuery(value);
            setFindIndex(0);
          }}
          onOptionsChange={(next) => {
            setFindOptions(next);
            setFindIndex(0);
          }}
          onNext={() => {
            if (findResult.matches.length > 0) {
              setFindIndex(findIndex + 1);
            }
          }}
          onPrev={() => {
            if (findResult.matches.length > 0) {
              setFindIndex(findIndex - 1);
            }
          }}
          onClose={() => {
            setFindOpen(false);
            scrollRef.current?.focus();
          }}
          label="在官方配置中查找"
        />
        <div
          ref={scrollRef}
          tabIndex={-1}
          data-official-scroll=""
          className="flex-1 overflow-auto font-mono text-xs leading-[1.55]"
        >
          {rows.map((row, index) => {
            const lineNo = index + 1;
            const classes = ['flex gap-2.5 whitespace-pre px-2.5'];
            if (focus?.lineNo === lineNo) {
              classes.push('bg-[#e0e7ff] text-[#1f2937] shadow-[inset_3px_0_0_#6366f1]');
            } else if (focusBlock.has(lineNo)) {
              classes.push('bg-[#f4f6ff] text-[#4b5563]');
            } else if (highlightLines.has(lineNo)) {
              classes.push('bg-[#fffbeb]');
            }

            return (
              <OfficialLine
                key={lineNo}
                lineNo={lineNo}
                row={row}
                lineStart={lineStarts[index]}
                className={classes.join(' ')}
                annotation={annotations.get(lineNo)}
                matches={matchesByLine.get(lineNo)}
                currentFrom={rowCurrentFrom(matchesByLine.get(lineNo), activeMatch)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
