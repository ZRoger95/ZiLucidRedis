import type { DirectiveDoc } from '../types';

const UNITS: [string, number][] = [
  ['tb', 1099511627776],
  ['gb', 1073741824],
  ['mb', 1048576],
  ['kb', 1024],
];

const NUMERIC_TYPES = new Set(['ulonglong', 'longlong', 'ulong', 'long', 'uint', 'int', 'sizet']);

export function parseMemory(token: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|b|t|g|m|k)?\s*$/i.exec(token);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  const unit = (match[2] ?? 'b').toLowerCase();
  const size = UNITS.find(([name]) => name === `${unit}b` || name[0] === unit[0])?.[1] ?? 1;
  return Math.round(value * size);
}

export function formatBytes(bytes: number): string {
  for (const [unit, size] of UNITS) {
    if (bytes >= size && bytes % size === 0) {
      return `${bytes / size}${unit}`;
    }
  }
  return `${bytes}b`;
}

const unquoteToken = (token: string) => {
  const trimmed = token.trim();
  if (trimmed.length >= 2 && (trimmed[0] === '"' || trimmed[0] === "'") && trimmed[0] === trimmed[trimmed.length - 1]) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export function normalizeValue(doc: DirectiveDoc | undefined, args: string[]): string {
  const tokens = args.map(unquoteToken).filter((arg) => arg.length > 0);
  if (tokens.length === 0) {
    return '';
  }

  const type = doc?.type ?? '';
  if (NUMERIC_TYPES.has(type)) {
    const bytes = tokens.map((token) => parseMemory(token));
    if (bytes.every((value) => value !== null)) {
      return (bytes as number[]).join(' ');
    }
  }

  if (type === 'bool' || type === 'enum') {
    return tokens.map((token) => token.replace(/\s+/g, ' ').toLowerCase()).join(' ');
  }

  return tokens.map((token) => token.replace(/\s+/g, ' ')).join(' ');
}
