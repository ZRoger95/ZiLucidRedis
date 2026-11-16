const NAME_RE = /^[A-Za-z][A-Za-z0-9-]*$/;
const MEMORY_UNITS = [
  ['tb', 1099511627776],
  ['gb', 1073741824],
  ['mb', 1048576],
  ['kb', 1024],
];

export function formatMemory(bytes) {
  for (const [unit, size] of MEMORY_UNITS) {
    if (bytes >= size && bytes % size === 0) return `${bytes / size}${unit}`;
  }
  return String(bytes);
}

function skipString(source, index) {
  const quote = source[index];
  let i = index + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

export function splitTopLevel(input) {
  const args = [];
  let depth = 0;
  let current = '';
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === '"' || ch === "'") {
      const end = skipString(input, i);
      current += input.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function extractCalls(source) {
  const calls = [];
  const pattern = /create([A-Za-z0-9_]+)Config\s*\(/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 1;
    let i = pattern.lastIndex;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '"' || ch === "'") {
        i = skipString(source, i);
        continue;
      }
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
      i += 1;
    }
    calls.push({ type: match[1].toLowerCase(), args: splitTopLevel(source.slice(pattern.lastIndex, i)) });
    pattern.lastIndex = i + 1;
  }
  return calls;
}

function buildEnumMap(source) {
  const map = new Map();
  const ambiguous = new Set();
  for (const match of source.matchAll(/\{\s*"([^"]+)"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g)) {
    const [, literal, constant] = match;
    if (map.has(constant) && map.get(constant) !== literal) ambiguous.add(constant);
    map.set(constant, literal);
  }
  return { map, ambiguous };
}

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
}

const ARITHMETIC = /^[\d\s+\-*/().]+$/;

function evalNumeric(raw) {
  if (!ARITHMETIC.test(raw)) return null;
  try {
    const value = Function(`"use strict";return (${raw})`)();
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

const NUMERIC_TYPES = new Set(['uint', 'int', 'ulong', 'long', 'ulonglong', 'longlong', 'sizet', 'timet', 'offt', 'duration']);

const KNOWN_TYPES = new Set([
  'bool',
  'uint',
  'int',
  'ulong',
  'long',
  'ulonglong',
  'longlong',
  'sizet',
  'timet',
  'offt',
  'duration',
  'enum',
  'string',
  'sds',
  'special',
]);

export function parseConfigC(source) {
  const { map: enumMap, ambiguous } = buildEnumMap(source);
  const entries = [];
  const unresolved = [];

  for (const { type, args } of extractCalls(source)) {
    if (!/^".*"$/.test(args[0] ?? '')) continue;
    const name = unquote(args[0]);
    if (!name || !NAME_RE.test(name) || name === 'NULL') continue;
    if (entries.some((entry) => entry.name === name)) continue;

    const has = (flag) => args.some((arg) => arg.includes(flag));
    const varIndex = args.findIndex((arg) => /^server\./.test(arg));
    const rawDefault = varIndex >= 0 ? args[varIndex + 1] ?? 'NULL' : 'NULL';
    const memory = has('MEMORY_CONFIG');
    const special = type === 'special' || has('MULTI_ARG_CONFIG');

    let defaultValue = null;
    if (!KNOWN_TYPES.has(type)) {
      defaultValue = null;
    } else if (!special) {
      if (rawDefault === 'NULL') {
        defaultValue = '';
      } else if (type === 'bool') {
        defaultValue = rawDefault === '1' ? 'yes' : 'no';
      } else if (type === 'enum') {
        defaultValue = enumMap.has(rawDefault) && !ambiguous.has(rawDefault) ? enumMap.get(rawDefault) : null;
      } else if (memory) {
        const bytes = evalNumeric(rawDefault);
        defaultValue = bytes === null ? unquote(rawDefault) : formatMemory(bytes);
      } else if (NUMERIC_TYPES.has(type)) {
        const numeric = evalNumeric(rawDefault);
        defaultValue = numeric === null ? unquote(rawDefault) : String(numeric);
      } else {
        defaultValue = unquote(rawDefault);
      }
    }

    if (defaultValue === null && !special) unresolved.push(name);

    entries.push({
      name,
      type,
      defaultValue,
      range: varIndex >= 5 ? `${args[3]}..${args[4]}` : null,
      sensitive: has('SENSITIVE_CONFIG'),
      modifiable: !has('IMMUTABLE_CONFIG'),
      multiArg: has('MULTI_ARG_CONFIG'),
    });
  }

  return { entries, unresolved };
}
