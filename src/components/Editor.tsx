import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, keymap, lineNumbers, WidgetType } from '@codemirror/view';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AnnotationBlock } from '../lib/annotations';
import type { AnalysisResult, JumpTarget } from '../types';

import { DEFAULT_FIND_OPTIONS, type FindMatch, findMatches, type FindOptions, type FindResult } from '../lib/find';
import { FindWidget } from './FindWidget';
import './editor.css';

interface EditorProps {
  value: string;
  result: AnalysisResult;
  blocks: AnnotationBlock[];
  onlyDiff: boolean;
  forceVisibleLines?: Set<number>;
  jumpTo: JumpTarget | null;
  focusRequest?: number;
  findRequest?: number;
  onChange: (text: string) => void;
  onCursorLine: (lineNo: number) => void;
  onCommitComment: (lineNo: number, text: string[]) => void;
}

const EMPTY_FIND_RESULT: FindResult = { matches: [], error: false };

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
    return (
      other.block.atLineNo === this.block.atLineNo &&
      other.block.summary === this.block.summary &&
      other.block.text.join('\n') === this.block.text.join('\n')
    );
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('details');
    wrap.className = 'annotation';

    const summary = document.createElement('summary');
    summary.textContent = this.block.summary;
    wrap.append(summary);

    wrap.addEventListener('toggle', () => view.requestMeasure());

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

function isQuietLine(result: AnalysisResult, lineNo: number, forceVisibleLines: Set<number> | undefined): boolean {
  const analysis = result.byLine.get(lineNo);
  return (
    (!analysis || analysis.status === 'default' || analysis.status === 'no-default' || analysis.status === 'special') &&
    !forceVisibleLines?.has(lineNo)
  );
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
    const quiet = isQuietLine(result, line.lineNo, forceVisibleLines);

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

function buildFindDecorations(state: EditorState, matches: FindMatch[], activeIndex: number): DecorationSet {
  const length = state.doc.length;
  const ranges = matches
    .filter((match) => match.to > match.from)
    .map((match, index) =>
      Decoration.mark({
        class: index === activeIndex ? 'cm-find-match cm-find-current' : 'cm-find-match',
      }).range(Math.min(match.from, length), Math.min(match.to, length)),
    );
  return Decoration.set(ranges, true);
}

export function Editor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const decorationCompartment = useRef(new Compartment());
  const searchCompartment = useRef(new Compartment());
  const latest = useRef(props);

  const lastFocusRequest = useRef(props.focusRequest);
  const lastFindRequest = useRef(props.findRequest);
  const findInput = useRef<HTMLInputElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findOptions, setFindOptions] = useState<FindOptions>(DEFAULT_FIND_OPTIONS);
  const [findIndex, setFindIndex] = useState(0);

  const hiddenLines = useMemo(() => {
    if (!props.onlyDiff) {
      return;
    }
    const lines = new Set<number>();
    for (const line of props.result.lines) {
      if (isQuietLine(props.result, line.lineNo, props.forceVisibleLines)) {
        lines.add(line.lineNo);
      }
    }
    return lines;
  }, [props.onlyDiff, props.result, props.forceVisibleLines]);

  const findResult = useMemo(
    () => (findOpen && findQuery ? findMatches(props.value, findQuery, findOptions) : EMPTY_FIND_RESULT),
    [findOpen, findQuery, findOptions, props.value],
  );
  const matches = useMemo(
    () => (hiddenLines ? findResult.matches.filter((match) => !hiddenLines.has(match.lineNo)) : findResult.matches),
    [findResult, hiddenLines],
  );
  const activeIndex = matches.length === 0 ? -1 : ((findIndex % matches.length) + matches.length) % matches.length;
  const activeMatch = activeIndex >= 0 ? matches[activeIndex] : null;
  const activeMatchRef = useRef<FindMatch | null>(null);

  useEffect(() => {
    latest.current = props;
  });

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
        searchCompartment.current.of([]),
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

  useEffect(() => {
    const instance = view.current;
    if (!instance || props.focusRequest === undefined) {
      return;
    }
    if (lastFocusRequest.current === props.focusRequest) {
      return;
    }
    lastFocusRequest.current = props.focusRequest;
    instance.focus();
  }, [props.focusRequest]);

  useEffect(() => {
    if (props.findRequest === undefined || lastFindRequest.current === props.findRequest) {
      return;
    }
    lastFindRequest.current = props.findRequest;
    setFindOpen(true);
  }, [props.findRequest]);

  useEffect(() => {
    if (!findOpen) {
      return;
    }
    findInput.current?.focus();
    findInput.current?.select();
  }, [findOpen, props.findRequest]);

  useEffect(() => {
    const instance = view.current;
    if (!instance) {
      return;
    }
    instance.dispatch({
      effects: searchCompartment.current.reconfigure(
        EditorView.decorations.of(buildFindDecorations(instance.state, matches, activeIndex)),
      ),
    });
  }, [matches, activeIndex]);

  useEffect(() => {
    activeMatchRef.current = activeMatch;
  });

  useEffect(() => {
    const instance = view.current;
    const match = activeMatchRef.current;
    if (!instance || !findOpen || !match) {
      return;
    }
    const length = instance.state.doc.length;
    const from = Math.min(match.from, length);
    const to = Math.min(match.to, length);
    instance.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
  }, [findOpen, findQuery, findOptions, activeIndex]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <FindWidget
        open={findOpen}
        query={findQuery}
        options={findOptions}
        matchCount={matches.length}
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
          if (matches.length > 0) {
            setFindIndex(findIndex + 1);
          }
        }}
        onPrev={() => {
          if (matches.length > 0) {
            setFindIndex(findIndex - 1);
          }
        }}
        onClose={() => {
          setFindOpen(false);
          view.current?.focus();
        }}
        label="在你的配置中查找"
      />
      <div className="editor-host" ref={host} />
    </div>
  );
}
