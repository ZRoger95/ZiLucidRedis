import { useEffect, useMemo, useRef } from 'react';

import type { AnnotationMode, DictFile, JumpTarget } from '../types';

import { type OfficialAnnotation, officialAnnotations } from '../lib/official';
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
}

export function OfficialPane({
  text,
  tag,
  publishedAt,
  dict,
  zhNotes,
  annotationMode,
  highlightLines,
  focus,
}: OfficialPaneProps) {
  const host = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => text.replace(/\r\n?/g, '\n').split('\n'), [text]);

  const annotations = useMemo(() => {
    if (!dict) {
      return new Map<number, OfficialAnnotation>();
    }
    const docs = new Map(dict.directives.map((directive) => [directive.name, directive]));
    return officialAnnotations(rows, docs, annotationMode, zhNotes);
  }, [rows, dict, annotationMode, zhNotes]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col" ref={host}>
      <div className="border-b border-line bg-[#f3f4f7] px-3 py-1.5 text-xs text-muted-foreground">
        官方完整配置 · {tag}
        {publishedAt ? ` · ${publishedAt.slice(0, 10)}` : ''} · 只读
      </div>
      <div className="flex-1 overflow-auto font-mono text-xs leading-[1.55]">
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
          const annotation = annotations.get(lineNo);

          return (
            <div key={lineNo}>
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
              <div data-official-line={lineNo} className={classes.join(' ')}>
                <span className="w-10 flex-none select-none text-right text-[#9aa1ad]">{lineNo}</span>
                <span className="whitespace-pre">{row || ' '}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
