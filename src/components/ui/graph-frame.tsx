import * as React from 'react';

import { cn } from '@/lib/utils';

import { childItems, defineItem, textOf, words } from './graph-markdown';

function GraphCorners({ mark = '+' }: { mark?: string }) {
  const corner =
    'pointer-events-none absolute z-10 flex size-4 items-center justify-center bg-[var(--graph-surface,var(--background))] font-mono text-sm leading-none text-graph-frame select-none';

  return (
    <>
      <span aria-hidden="true" className={cn(corner, 'top-0 left-0 -translate-x-1/2 -translate-y-1/2')}>
        {mark}
      </span>
      <span aria-hidden="true" className={cn(corner, 'top-0 right-0 translate-x-1/2 -translate-y-1/2')}>
        {mark}
      </span>
      <span aria-hidden="true" className={cn(corner, 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2')}>
        {mark}
      </span>
      <span aria-hidden="true" className={cn(corner, 'right-0 bottom-0 translate-x-1/2 translate-y-1/2')}>
        {mark}
      </span>
    </>
  );
}

type GraphFrame = 'box' | 'corners' | 'rule' | 'none';

const GRAPH_FRAMES = ['box', 'corners', 'rule', 'none'] as const;

const GraphFrameContext = React.createContext<GraphFrame | undefined>(undefined);

function GraphFrameProvider({ frame, children }: { frame: GraphFrame; children?: React.ReactNode }) {
  return <GraphFrameContext.Provider value={frame}>{children}</GraphFrameContext.Provider>;
}

function useGraphFrame(): GraphFrame {
  return React.useContext(GraphFrameContext) ?? 'box';
}

function GraphTitle({
  placement = 'edge',
  className,
  children,
  ...props
}: React.ComponentProps<'figcaption'> & {
  placement?: 'edge' | 'inline';
}) {
  return (
    <figcaption
      className={cn(
        'tracking-wide whitespace-nowrap uppercase',
        placement === 'edge'
          ? 'absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 bg-[var(--graph-surface,var(--background))] px-2.5'
          : 'mb-4 block truncate',
        className,
      )}
      {...props}
    >
      <span className="graph-title-ink text-graph-accent">[ {children} ]</span>
    </figcaption>
  );
}

const bodyPadding: Record<GraphFrame, string | undefined> = {
  box: undefined,
  corners: undefined,
  rule: 'px-0 sm:px-0',
  none: 'p-0 sm:p-0',
};

function GraphBody({ className, ...props }: React.ComponentProps<'div'>) {
  const frame = useGraphFrame();

  return <div className={cn('min-w-0 px-5 py-7 sm:px-8 sm:py-8', className, bodyPadding[frame])} {...props} />;
}

function GraphRule({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden="true" className={cn('graph-rule w-full', className)} {...props} />;
}

function GraphRuleY({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden="true" className={cn('graph-rule-y self-stretch', className)} {...props} />;
}

function GraphTrack({ className, ...props }: React.ComponentProps<'span'>) {
  return <span aria-hidden="true" className={cn('flex w-full min-w-0 select-none', className)} {...props} />;
}

function GraphTick({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('min-w-0 flex-1 overflow-hidden text-center', className)} {...props} />;
}

const graphProseClass = cn(
  'max-w-[72ch] min-w-0 space-y-3 leading-relaxed',
  '[&_p]:m-0 [&_p]:text-pretty',
  '[&_ul]:m-0 [&_ul]:flex [&_ul]:list-none [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:p-0',
  '[&_ol]:m-0 [&_ol]:flex [&_ol]:list-none [&_ol]:flex-col [&_ol]:gap-1 [&_ol]:p-0',
  "[&_li]:relative [&_li]:pl-4 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-graph-muted [&_li]:before:content-['-']",
  '[&_a]:text-foreground [&_a]:underline [&_a]:decoration-graph-frame [&_a]:decoration-dashed [&_a]:underline-offset-[0.2em]',
  '[&_code]:font-semibold [&_code]:text-foreground',
  '[&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre_code]:font-normal [&_pre_code]:text-inherit',
  '[&_strong]:font-semibold [&_strong]:text-foreground',
  '[&_em]:text-graph-muted [&_em]:not-italic',
);

function GraphProse({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn(graphProseClass, className)} {...props} />;
}

type CellProps = {
  align?: 'left' | 'right';
};

type RowProps = {
  label?: string;
  cells?: React.ReactNode[];
};

const Head = defineItem('Head');

const Row = defineItem<RowProps>('Row');

const Foot = defineItem<RowProps>('Foot');

const Cell = defineItem<CellProps>('Cell');

function cellsOf(value?: React.ReactNode[] | string, children?: React.ReactNode): React.ReactNode[] {
  if (Array.isArray(value)) {
    return value;
  }

  const nested = childItems(children, Cell);
  if (nested.length > 0) {
    return nested.map((cell) => cell.children ?? '');
  }

  const text = (typeof value === 'string' ? value : textOf(children)).trim();
  if (!text) {
    return [];
  }

  if (text.includes('|')) {
    return text.split('|').map((cell) => cell.trim());
  }

  return words(text);
}

function alignsOf(children?: React.ReactNode): ('left' | 'right')[] | undefined {
  const cells = childItems(children, Cell);
  if (!cells.some((cell) => cell.align)) {
    return undefined;
  }

  return cells.map((cell, index) => cell.align ?? (index === 0 ? 'left' : 'right'));
}

function Graph({
  title,
  corner = '+',
  frame: frameProp,
  className,
  children,
  ...props
}: React.ComponentProps<'figure'> & {
  title?: string;
  corner?: string;
  frame?: GraphFrame;
}) {
  const captionId = React.useId();
  const inherited = React.useContext(GraphFrameContext);
  const frame = frameProp ?? inherited ?? 'box';

  return (
    <GraphFrameContext.Provider value={frame}>
      <figure
        aria-labelledby={title ? captionId : undefined}
        className={cn(
          'relative w-full min-w-0 font-mono text-sm text-foreground',
          frame === 'box' && 'graph-frame',
          className,
        )}
        data-frame={frame}
        {...props}
      >
        {title ? (
          <GraphTitle id={captionId} placement={frame === 'none' ? 'inline' : 'edge'}>
            {title}
          </GraphTitle>
        ) : null}
        {frame === 'box' || frame === 'corners' ? <GraphCorners mark={corner} /> : null}
        {frame === 'rule' ? (
          <>
            <GraphRule className="absolute inset-x-0 top-0" />
            <GraphRule className="absolute inset-x-0 bottom-0" />
          </>
        ) : null}
        {children}
      </figure>
    </GraphFrameContext.Provider>
  );
}

export {
  childElements,
  childItems,
  childrenOf,
  defineItem,
  dropLead,
  dropText,
  elementsOf,
  firstToken,
  fraction,
  GRAPH_HOST_TAGS,
  hasHost,
  headingSections,
  hostOf,
  isHost,
  itemParts,
  itemText,
  labeledTable,
  linesOf,
  listItems,
  nestedList,
  childNodes,
  numberOf,
  numbers,
  paragraphsOf,
  runs,
  seriesOf,
  sourceText,
  splitDash,
  splitLabel,
  tableOf,
  takeText,
  textOf,
  typeName,
  unlazy,
  words,
} from './graph-markdown';
export type { GraphItemComponent, MdAlign, MdTable } from './graph-markdown';
export {
  alignsOf,
  Cell,
  cellsOf,
  Foot,
  Graph,
  GraphBody,
  GraphCorners,
  GraphFrameProvider,
  GRAPH_FRAMES,
  GraphProse,
  graphProseClass,
  GraphRule,
  GraphRuleY,
  GraphTick,
  GraphTitle,
  GraphTrack,
  Head,
  Row,
  useGraphFrame,
};
export type { CellProps, GraphFrame, RowProps };
