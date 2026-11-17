import { useEffect, useMemo, useRef } from 'react';
import type { AnnotationMode, DictFile } from '../types';
import { officialAnnotations } from '../lib/official';

interface OfficialPaneProps {
  text: string;
  tag: string;
  publishedAt?: string;
  dict: DictFile | null;
  annotationMode: AnnotationMode;
  highlightLines: Set<number>;
  focus: { lineNo: number; nonce: number } | null;
}

export function OfficialPane({ text, tag, publishedAt, dict, annotationMode, highlightLines, focus }: OfficialPaneProps) {
  const host = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => text.replace(/\r\n?/g, '\n').split('\n'), [text]);

  const annotations = useMemo(() => {
    if (!dict) return new Map<number, string[]>();
    const docs = new Map(dict.directives.map((directive) => [directive.name, directive]));
    return officialAnnotations(rows, docs, annotationMode);
  }, [rows, dict, annotationMode]);

  const focusBlock = useMemo(() => {
    const block = new Set<number>();
    if (!focus) return block;
    let index = focus.lineNo - 2;
    while (index >= 0 && rows[index].trim().startsWith('#')) {
      block.add(index + 1);
      index -= 1;
    }
    return block;
  }, [focus, rows]);

  useEffect(() => {
    if (!focus) return;
    const target = host.current?.querySelector<HTMLElement>(`[data-official-line="${focus.lineNo}"]`);
    target?.scrollIntoView({ block: 'center' });
  }, [focus]);

  return (
    <div className="official" ref={host}>
      <div className="official-head">
        官方完整配置 · {tag}
        {publishedAt ? ` · ${publishedAt.slice(0, 10)}` : ''} · 只读
      </div>
      <div className="official-body">
        {rows.map((row, index) => {
          const lineNo = index + 1;
          const classes = ['official-line'];
          if (highlightLines.has(lineNo)) classes.push('is-highlight');
          if (focusBlock.has(lineNo)) classes.push('is-context');
          if (focus?.lineNo === lineNo) classes.push('is-focus');
          const annotation = annotations.get(lineNo);

          return (
            <div key={lineNo}>
              {annotation ? (
                <details className="annotation official-annotation">
                  <summary>官方注释 · {annotation[annotation.length - 1]}</summary>
                  <div className="annotation-body">
                    {annotation.slice(0, -1).map((comment, commentIndex) => (
                      <div key={`${lineNo}-${commentIndex}`}>{comment || ' '}</div>
                    ))}
                  </div>
                </details>
              ) : null}
              <div data-official-line={lineNo} className={classes.join(' ')}>
                <span className="official-no">{lineNo}</span>
                <span className="official-text">{row || ' '}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
