import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

type WithChildren<P> = P & { children?: ReactNode };

type GraphItemComponent<P extends object> = ((props: WithChildren<P>) => null) & {
  graphItem: string;
  displayName?: string;
};

function defineItem<P extends object>(name: string): GraphItemComponent<P> {
  return Object.assign(() => null, { displayName: name, graphItem: name });
}

function typeName(type: unknown): string {
  if (typeof type === 'string') {
    return type;
  }

  if (typeof type === 'function') {
    const fn = type as {
      graphItem?: string;
      graphHost?: string;
      displayName?: string;
      name?: string;
    };
    return fn.graphItem || fn.graphHost || fn.displayName || fn.name || '';
  }

  if (type && typeof type === 'object') {
    const obj = type as {
      graphItem?: string;
      graphHost?: string;
      displayName?: string;
      $$id?: string;
      name?: string;
    };
    if (obj.graphItem) {
      return obj.graphItem;
    }
    if (obj.graphHost) {
      return obj.graphHost;
    }
    if (obj.displayName) {
      return obj.displayName;
    }
    if (typeof obj.$$id === 'string') {
      const id = obj.$$id.split('#').pop() ?? '';
      return id.split('@')[0] ?? '';
    }
    if (obj.name) {
      return obj.name;
    }
  }

  return '';
}

function hostOf(element: ReactElement): string {
  const marked = (element.props as { 'data-graph-host'?: unknown })['data-graph-host'];
  return typeof marked === 'string' ? marked : typeName(element.type);
}

function isHost(element: ReactElement, tags: string | readonly string[]): boolean {
  const name = hostOf(element).toLowerCase();
  const list = typeof tags === 'string' ? [tags] : tags;
  return list.some((tag) => tag.toLowerCase() === name);
}

const LAZY = Symbol.for('react.lazy');

function unlazy(node: ReactNode): ReactNode {
  let current: unknown = node;
  for (let depth = 0; depth < 8; depth += 1) {
    const lazy = current as {
      $$typeof?: unknown;
      _payload?: unknown;
      _init?: (payload: unknown) => unknown;
    } | null;
    if (!lazy || typeof lazy !== 'object' || lazy.$$typeof !== LAZY) {
      return current as ReactNode;
    }
    try {
      current = lazy._init?.(lazy._payload);
    } catch {
      return null;
    }
  }
  return current as ReactNode;
}

function childNodes(children: ReactNode): ReactNode[] {
  return Children.toArray(unlazy(children)).map(unlazy);
}

function elementsOf(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  for (const child of childNodes(children)) {
    if (!isValidElement(child)) {
      continue;
    }
    if (child.type === Fragment) {
      out.push(...elementsOf((child.props as { children?: ReactNode }).children));
      continue;
    }
    out.push(child);
  }
  return out;
}

function listItems(children: ReactNode): ReactElement[] {
  const elements = elementsOf(children);
  const lists = elements.filter((element) => isHost(element, ['ul', 'ol']));
  const items =
    lists.length > 0
      ? lists.flatMap((list) => elementsOf((list.props as { children?: ReactNode }).children))
      : elements;
  return items.filter((element) => isHost(element, 'li'));
}

function nestedList(item: ReactElement): ReactElement[] {
  return listItems((item.props as { children?: ReactNode }).children);
}

function itemText(item: ReactElement): string {
  const parts: ReactNode[] = [];
  for (const child of childNodes((item.props as { children?: ReactNode }).children)) {
    if (isValidElement(child) && isHost(child, ['ul', 'ol'])) {
      continue;
    }
    parts.push(child);
  }
  return textOf(parts).replace(/\s+/g, ' ').trim();
}

function hasHost(node: ReactNode, tags: string | readonly string[]) {
  for (const child of childNodes(node)) {
    if (!isValidElement(child)) {
      continue;
    }
    if (isHost(child, tags)) {
      return true;
    }
    if (hasHost((child.props as { children?: ReactNode }).children, tags)) {
      return true;
    }
  }
  return false;
}

function paragraphsOf(children: ReactNode): ReactElement[] {
  return elementsOf(children).filter((element) => isHost(element, 'p'));
}

function childrenOf(element: ReactElement): ReactNode {
  return (element.props as { children?: ReactNode }).children;
}

function itemParts(item: ReactElement): {
  head: ReactNode;
  body: ReactElement[];
  lists: ReactElement[];
} {
  const content = childrenOf(item);
  const nodes = childNodes(content);
  const isList = (node: ReactNode) => isValidElement(node) && isHost(node, ['ul', 'ol']);
  const lists = nodes.filter(isList) as ReactElement[];
  const first = nodes.findIndex((node) => isValidElement(node) && isHost(node, 'p'));

  if (first === -1) {
    return { head: nodes.filter((node) => !isList(node)), body: [], lists };
  }

  return {
    head: childrenOf(nodes[first] as ReactElement),
    body: nodes.slice(first + 1).filter((node): node is ReactElement => isValidElement(node) && !isList(node)),
    lists,
  };
}

function dropText(node: ReactNode, count: number): ReactNode {
  let left = count;
  let trimming = count > 0;

  function walk(input: ReactNode): ReactNode {
    const current = unlazy(input);
    if (current == null || typeof current === 'boolean') {
      return current;
    }

    if (typeof current === 'string' || typeof current === 'number') {
      let text = String(current);
      if (left > 0) {
        const cut = Math.min(left, text.length);
        left -= cut;
        text = text.slice(cut);
      }
      if (left === 0 && trimming) {
        const trimmed = text.replace(/^\s+/, '');
        if (trimmed) {
          trimming = false;
        }
        text = trimmed;
      }
      return text === '' ? null : text;
    }

    if (Array.isArray(current)) {
      return childNodes(current).map(walk);
    }

    if (isValidElement(current)) {
      if (left === 0 && !trimming) {
        return current;
      }
      const before = textOf(childrenOf(current));
      const inner = walk(childrenOf(current));
      if (before !== '' && textOf(inner) === '') {
        return null;
      }
      return cloneElement(current as ReactElement<{ children?: ReactNode }>, undefined, inner);
    }

    return current;
  }

  return walk(node);
}

function takeText(node: ReactNode, count: number): ReactNode {
  let left = count;

  function walk(input: ReactNode): ReactNode {
    const current = unlazy(input);
    if (current == null || typeof current === 'boolean') {
      return current;
    }

    if (typeof current === 'string' || typeof current === 'number') {
      const text = String(current);
      const kept = text.slice(0, Math.max(0, left));
      left -= kept.length;
      return kept === '' ? null : kept;
    }

    if (Array.isArray(current)) {
      return childNodes(current).map(walk);
    }

    if (isValidElement(current)) {
      if (left <= 0) {
        return null;
      }
      const before = textOf(childrenOf(current));
      const inner = walk(childrenOf(current));
      if (before !== '' && textOf(inner) === '') {
        return null;
      }
      return cloneElement(current as ReactElement<{ children?: ReactNode }>, undefined, inner);
    }

    return current;
  }

  return walk(node);
}

function dropLead(node: ReactNode, pattern: RegExp): { match: RegExpMatchArray | null; rest: ReactNode } {
  const match = textOf(node).match(pattern);
  if (!match || match.index !== 0) {
    return { match: null, rest: node };
  }
  return { match, rest: dropText(node, match[0].length) };
}

function sourceText(input: ReactNode): string {
  const node = unlazy(input);
  if (node == null || typeof node === 'boolean') {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(sourceText).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    const inner = sourceText(node.props.children);
    if (isHost(node, ['em', 'i'])) {
      return `*${inner}*`;
    }
    if (isHost(node, ['strong', 'b'])) {
      return `**${inner}**`;
    }
    if (isHost(node, ['del', 's'])) {
      return `~~${inner}~~`;
    }
    if (isHost(node, ['p', 'li', 'br'])) {
      return `${inner}\n`;
    }
    return inner;
  }

  return '';
}

function runs(value: readonly string[] | string | undefined): string[] {
  if (value == null) {
    return [];
  }
  const tokens = typeof value === 'string' ? value.split(/[\s,]+/).filter(Boolean) : [...value];
  const out: string[] = [];

  for (const token of tokens) {
    const match = token.match(/^(.+?)[*×](\d{1,4})$/);
    if (!match) {
      out.push(token);
      continue;
    }
    const count = Math.min(5000, Number(match[2]));
    for (let index = 0; index < count; index += 1) {
      out.push(match[1] ?? token);
    }
  }

  return out;
}

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

function headingSections(children: ReactNode): {
  title: string;
  children: ReactNode;
}[] {
  const sections: { title: string; children: ReactNode[] }[] = [];
  let current: { title: string; children: ReactNode[] } | null = null;

  for (const element of elementsOf(children)) {
    if (isHost(element, HEADING_TAGS)) {
      current = {
        title: textOf((element.props as { children?: ReactNode }).children).trim(),
        children: [],
      };
      sections.push(current);
      continue;
    }

    current?.children.push(element);
  }

  return sections;
}

type MdAlign = 'left' | 'right';

type MdTable = {
  headers: string[];
  rows: string[][];
  footer?: string[];
  align?: MdAlign[];
};

function cellAlign(cell: ReactElement): MdAlign | undefined {
  const props = cell.props as {
    align?: string;
    style?: { textAlign?: string };
  };
  const value = props.align || props.style?.textAlign;
  if (value === 'right') {
    return 'right';
  }
  if (value === 'left') {
    return 'left';
  }
  return undefined;
}

function rowCells(row: ReactElement): {
  values: string[];
  align: (MdAlign | undefined)[];
} {
  const cells = elementsOf((row.props as { children?: ReactNode }).children).filter((cell) =>
    isHost(cell, ['th', 'td']),
  );
  return {
    values: cells.map((cell) => textOf((cell.props as { children?: ReactNode }).children).trim()),
    align: cells.map(cellAlign),
  };
}

function rowsIn(section: ReactElement | undefined) {
  if (!section) {
    return [];
  }
  return elementsOf((section.props as { children?: ReactNode }).children).filter((row) => isHost(row, 'tr'));
}

function isTotal(row: ReactElement) {
  const first = elementsOf(childrenOf(row)).find((cell) => isHost(cell, ['th', 'td']));
  if (!first) {
    return false;
  }
  const content = childrenOf(first);
  const nodes = childNodes(content).filter((node) => textOf(node).trim() !== '');
  const bold = nodes.length === 1 && isValidElement(nodes[0]) && isHost(nodes[0], ['strong', 'b']);
  return bold || /^total$/i.test(textOf(content).trim());
}

function tableOf(children: ReactNode): MdTable | null {
  const table = elementsOf(children).find((element) => isHost(element, 'table'));
  if (!table) {
    return null;
  }

  const sections = elementsOf((table.props as { children?: ReactNode }).children);
  const thead = sections.find((element) => isHost(element, 'thead'));
  const tbody = sections.find((element) => isHost(element, 'tbody'));
  const tfoot = sections.find((element) => isHost(element, 'tfoot'));
  const body = tbody ?? table;
  const heads = rowsIn(thead);
  const bodies = rowsIn(body).filter((row) => !heads.includes(row));
  const foots = rowsIn(tfoot);
  const headRow = heads[0] ?? bodies[0];
  if (!headRow) {
    return null;
  }

  const head = rowCells(headRow);
  const rest = heads[0] ? bodies : bodies.slice(1);
  const last = rest.at(-1);

  const written = !foots[0] && last && rest.length > 1 && isTotal(last) ? last : undefined;
  const dataRows = (written ? rest.slice(0, -1) : rest).map((row) => rowCells(row).values);
  const footRow = foots[0] ?? written;
  const foot = footRow ? rowCells(footRow).values : undefined;
  const align = head.align.some(Boolean)
    ? head.align.map((value, index) => value ?? (index === 0 ? 'left' : 'right'))
    : undefined;

  return {
    headers: head.values,
    rows: dataRows,
    footer: foot,
    align,
  };
}

function labeledTable(children: ReactNode): {
  columns: string[];
  rows: { label: string; values: string[] }[];
  align?: MdAlign[];
} | null {
  const table = tableOf(children);
  if (!table || table.headers.length < 2) {
    return null;
  }

  const labeled = table.headers[0] === '' || table.headers[0] === '—' || table.headers[0] === '-';

  if (!labeled) {
    return {
      columns: table.headers,
      rows: table.rows.map((row) => ({
        label: row[0] ?? '',
        values: row.slice(1),
      })),
      align: table.align,
    };
  }

  return {
    columns: table.headers.slice(1),
    rows: table.rows.map((row) => ({
      label: row[0] ?? '',
      values: row.slice(1),
    })),
    align: table.align?.slice(1),
  };
}

function splitLabel(text: string): { label: string; rest: string } {
  const match = text.match(/^(.+?):\s+(.+)$/);
  if (!match) {
    return { label: text, rest: '' };
  }
  return {
    label: (match[1] ?? text).trim(),
    rest: (match[2] ?? '').trim(),
  };
}

function splitDash(text: string): { label: string; rest: string } {
  const parts = text.split(/\s+[—–]\s+/);
  if (parts.length < 2) {
    return { label: text, rest: '' };
  }
  return {
    label: (parts[0] ?? text).trim(),
    rest: parts.slice(1).join(' — ').trim(),
  };
}

function firstToken(text: string): { token: string; rest: string } {
  const match = text.match(/^(\S+)\s*(.*)$/);
  if (!match) {
    return { token: text, rest: '' };
  }
  return { token: match[1] ?? text, rest: match[2] ?? '' };
}

function textOf(input: ReactNode): string {
  const node = unlazy(input);
  if (node == null || typeof node === 'boolean') {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }

  return '';
}

function childItems<P extends object>(children: ReactNode, Item: GraphItemComponent<P>): WithChildren<P>[] {
  const tag = Item.graphItem;
  return elementsOf(children)
    .filter((element) => typeName(element.type) === tag)
    .map((element) => element.props as WithChildren<P>);
}

function childElements(children: ReactNode) {
  return elementsOf(children).map((element) => ({
    element,
    tag: typeName(element.type) || undefined,
  }));
}

function numbers(value: readonly number[] | string | undefined): number[] {
  if (value == null) {
    return [];
  }

  if (typeof value === 'string') {
    return runs(value)
      .map(Number)
      .filter((entry) => Number.isFinite(entry));
  }

  return [...value];
}

function words<T extends string>(value: readonly T[] | string | undefined): T[] {
  if (value == null) {
    return [];
  }

  if (typeof value === 'string') {
    return value.split(/[\s,]+/).filter(Boolean) as T[];
  }

  return [...value];
}

function fraction(value: number | string | undefined, fallback = 0): number {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'number') {
    return value;
  }

  const text = value.trim();
  const percent = text.endsWith('%');
  const parsed = Number.parseFloat(text);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return percent ? parsed / 100 : parsed;
}

function numberOf(value: number | string | undefined, fallback = 0): number {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number.parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function seriesOf(children: ReactNode): {
  data: number[];
  labels: string[];
  caption?: string;
} {
  const listed = listItems(children);
  if (listed.length > 0) {
    const rows = listed.map((item) => {
      const { label, rest } = splitLabel(itemText(item));
      return rest ? { label, value: numberOf(rest, Number.NaN) } : { label: '', value: numberOf(label, Number.NaN) };
    });
    const kept = rows.filter((row) => Number.isFinite(row.value));
    return {
      data: kept.map((row) => row.value),
      labels: kept.some((row) => row.label) ? kept.map((row) => row.label) : [],
    };
  }

  const { label, rest } = splitDash(sourceText(children).replace(/\s+/g, ' ').trim());
  return { data: numbers(label), labels: [], caption: rest || undefined };
}

function linesOf(node: ReactNode): string[] {
  const paragraphs = paragraphsOf(node);
  if (paragraphs.length > 0) {
    return paragraphs.flatMap((paragraph) => linesOf(childrenOf(paragraph)));
  }
  return textOf(node)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const GRAPH_HOST_TAGS = [
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'del',
  's',
  'code',
  'pre',
  'input',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
] as const;

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
};
export type { GraphItemComponent, MdAlign, MdTable, WithChildren };
