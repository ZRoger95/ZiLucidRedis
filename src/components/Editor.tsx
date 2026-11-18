import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, keymap, lineNumbers, WidgetType } from '@codemirror/view';
import { useEffect, useRef } from 'react';

import type { AnnotationBlock } from '../lib/annotations';
import type { AnalysisResult } from '../types';

import './editor.css';

interface EditorProps {
  value: string;
  result: AnalysisResult;
  blocks: AnnotationBlock[];
  onlyDiff: boolean;
  forceVisibleLines?: Set<number>;
  jumpTo: { lineNo: number; nonce: number; focus?: boolean } | null;
  onChange: (text: string) => void;
  onCursorLine: (lineNo: number) => void;
  onCommitComment: (lineNo: number, text: string[]) => void;
}

const baseTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-content': { padding: '8px 0' },
  '.cm-gutters': { background: '#fbfbfc', borderRight: '1px solid #e2e5ea', color: '#9aa1ad' },
  '.cm-line': { padding: '0 10px' },
});

class AnnotationWidget extends WidgetType {
  constructor(
    readonly block: AnnotationBlock,
    readonly onCommit: (lineNo: number, text: string[]) => void,
  ) {
    super();
  }

  eq(other: AnnotationWidget) {
    return other.block.atLineNo === this.block.atLineNo && other.block.text.join('\n') === this.block.text.join('\n');
  }

  toDOM() {
    const wrap = document.createElement('details');
    wrap.className = 'annotation';

    const summary = document.createElement('summary');
    summary.textContent = `官方注释 · ${this.block.text[this.block.text.length - 1] ?? ''}`;
    wrap.append(summary);

    const body = document.createElement('div');
    body.className = 'annotation-body';
    for (const row of this.block.text.slice(0, -1)) {
      const line = document.createElement('div');
      line.textContent = row === '' ? ' ' : row;
      body.append(line);
    }

    const commit = document.createElement('button');
    commit.type = 'button';
    commit.className = 'annotation-commit';
    commit.textContent = '写入配置';
    commit.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onCommit(this.block.atLineNo, this.block.text);
    });
    body.append(commit);

    wrap.append(body);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

function buildDecorations(
  state: EditorState,
  result: AnalysisResult,
  blocks: AnnotationBlock[],
  onlyDiff: boolean,
  forceVisibleLines: Set<number> | undefined,
  onCommit: (lineNo: number, text: string[]) => void,
): DecorationSet {
  const doc = state.doc;
  const ranges: { from: number; deco: Decoration }[] = [];

  for (const line of result.lines) {
    if (line.lineNo > doc.lines) {
      continue;
    }
    const position = doc.line(line.lineNo).from;
    const analysis = result.byLine.get(line.lineNo);
    const quiet =
      (!analysis ||
        analysis.status === 'default' ||
        analysis.status === 'no-default' ||
        analysis.status === 'special') &&
      !forceVisibleLines?.has(line.lineNo);

    if (onlyDiff) {
      if (quiet) {
        ranges.push({ from: position, deco: Decoration.line({ class: 'cm-hide-line' }) });
      } else {
        ranges.push({ from: position, deco: Decoration.line({ class: `cm-status-${analysis!.status}` }) });
      }
      continue;
    }
    if (!quiet) {
      ranges.push({ from: position, deco: Decoration.line({ class: `cm-status-${analysis!.status}` }) });
    }
  }

  for (const block of blocks) {
    if (block.atLineNo > doc.lines) {
      continue;
    }
    ranges.push({
      from: doc.line(block.atLineNo).from,
      deco: Decoration.widget({ widget: new AnnotationWidget(block, onCommit), block: true, side: -1 }),
    });
  }

  return Decoration.set(
    ranges.map((range) => range.deco.range(range.from)),
    true,
  );
}

export function Editor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const decorationCompartment = useRef(new Compartment());
  const latest = useRef(props);

  // 把最新 props 同步给 CodeMirror 的回调，避免在渲染期写 ref
  useEffect(() => {
    latest.current = props;
  });

  // CodeMirror 是 React 之外的编辑器实例，必须手动挂载和销毁
  useEffect(() => {
    if (!host.current) {
      return;
    }
    const state = EditorState.create({
      doc: latest.current.value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        baseTheme,
        decorationCompartment.current.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            latest.current.onChange(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            latest.current.onCursorLine(update.state.doc.lineAt(head).number);
          }
        }),
      ],
    });
    const instance = new EditorView({ state, parent: host.current });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = view.current;
    if (!instance) {
      return;
    }
    if (instance.state.doc.toString() !== props.value) {
      instance.dispatch({ changes: { from: 0, to: instance.state.doc.length, insert: props.value } });
    }
  }, [props.value]);

  useEffect(() => {
    const instance = view.current;
    if (!instance) {
      return;
    }
    instance.dispatch({
      effects: decorationCompartment.current.reconfigure(
        EditorView.decorations.of(
          buildDecorations(
            instance.state,
            props.result,
            props.blocks,
            props.onlyDiff,
            props.forceVisibleLines,
            props.onCommitComment,
          ),
        ),
      ),
    });
  }, [props.result, props.blocks, props.onlyDiff, props.forceVisibleLines, props.onCommitComment]);

  useEffect(() => {
    const instance = view.current;
    if (!instance || !props.jumpTo) {
      return;
    }
    const lineNo = Math.min(Math.max(props.jumpTo.lineNo, 1), instance.state.doc.lines);
    const target = instance.state.doc.line(lineNo);
    instance.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
    });
    if (props.jumpTo.focus !== false) {
      instance.focus();
    }
  }, [props.jumpTo]);

  return <div className="editor-host" ref={host} />;
}
