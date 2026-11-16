import type { LineKind, ParsedLine, QuoteStyle } from '../types';

const NAME_RE = /^[A-Za-z][A-Za-z0-9-]*$/;

export function tokenizeArgs(input: string): { args: string[]; quoteStyles: QuoteStyle[] } {
  const args: string[] = [];
  const quoteStyles: QuoteStyle[] = [];
  let i = 0;

  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i += 1;
    if (i >= input.length) break;

    const quote = input[i];
    if (quote === '"' || quote === "'") {
      const style: QuoteStyle = quote === '"' ? 'double' : 'single';
      let value = '';
      i += 1;
      while (i < input.length) {
        if (input[i] === '\\') {
          value += input[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (input[i] === quote) {
          i += 1;
          break;
        }
        value += input[i];
        i += 1;
      }
      args.push(value);
      quoteStyles.push(style);
      continue;
    }

    let value = '';
    while (i < input.length && !/\s/.test(input[i])) {
      value += input[i];
      i += 1;
    }
    args.push(value);
    quoteStyles.push('plain');
  }

  return { args, quoteStyles };
}

export function decodeConfBytes(bytes: ArrayBuffer): { text: string; warning: string | null } {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const withoutBom = decoded.replace(/^\uFEFF/, '');
  const text = withoutBom.replace(/\r\n?/g, '\n');
  const replacement = (text.match(/\uFFFD/g) ?? []).length;
  const warning =
    text.length > 0 && replacement / text.length > 0.005
      ? '文件可能不是 UTF-8 编码，请确认内容是否乱码'
      : null;
  return { text, warning };
}

export function parseConf(text: string): ParsedLine[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = normalized.split('\n');
  if (rows.length && rows[rows.length - 1] === '') rows.pop();

  return rows.map((raw, index) => {
    const lineNo = index + 1;
    const trimmed = raw.trim();

    let kind: LineKind;
    if (!trimmed) kind = 'blank';
    else if (trimmed.startsWith('#')) kind = 'comment';
    else {
      const name = trimmed.split(/\s+/)[0];
      const templated = /[<>|]/.test(trimmed);
      kind = NAME_RE.test(name) && !templated ? 'directive' : 'unknown';
    }

    if (kind !== 'directive') return { lineNo, raw, kind };

    const rest = trimmed.slice(trimmed.indexOf(trimmed.split(/\s+/)[0]) + trimmed.split(/\s+/)[0].length);
    const { args, quoteStyles } = tokenizeArgs(rest);
    return { lineNo, raw, kind, name: trimmed.split(/\s+/)[0], args, quoteStyles };
  });
}
