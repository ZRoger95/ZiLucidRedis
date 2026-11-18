export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
  lineNo: number;
}

export interface FindResult {
  matches: FindMatch[];
  error: boolean;
}

export const DEFAULT_FIND_OPTIONS: FindOptions = {
  caseSensitive: false,
  wholeWord: false,
  regexp: false,
};

const EMPTY_MATCHES: FindMatch[] = [];
const WORD_CHAR = /^[A-Za-z0-9_]$/;

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

export function findMatches(
  text: string,
  query: string,
  options: FindOptions,
  skipLines?: ReadonlySet<number>,
): FindResult {
  if (!query) {
    return { matches: EMPTY_MATCHES, error: false };
  }

  // 与 VS Code 一致：正则默认按行处理 ^ 和 $，因此带上 m 标志
  const source = options.regexp ? query : escapeRegExp(query);
  let regex: RegExp;
  try {
    regex = new RegExp(source, options.caseSensitive ? 'gm' : 'gim');
  } catch {
    return { matches: EMPTY_MATCHES, error: true };
  }

  const lineStarts = buildLineStarts(text);
  const matches: FindMatch[] = [];
  let lineIndex = 0;

  for (let match = regex.exec(text); match; match = regex.exec(text)) {
    const from = match.index;
    const to = from + match[0].length;
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }

    while (lineIndex + 1 < lineStarts.length && lineStarts[lineIndex + 1] <= from) {
      lineIndex += 1;
    }
    const lineNo = lineIndex + 1;
    if (skipLines?.has(lineNo)) {
      continue;
    }

    if (options.wholeWord) {
      const before = from > 0 ? text[from - 1] : '';
      const after = to < text.length ? text[to] : '';
      if (WORD_CHAR.test(before) || WORD_CHAR.test(after)) {
        continue;
      }
    }

    matches.push({ from, to, lineNo });
  }

  return { matches, error: false };
}
