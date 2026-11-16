import type {
  AnalysisResult,
  DictFile,
  LineAnalysis,
  MetaIndex,
  ParsedLine,
  Status,
} from '../types';
import { normalizeValue } from './normalize';
import { tokenizeArgs } from './parseConf';

const IMPORTANT = ['maxmemory', 'maxmemory-policy', 'appendonly', 'save', 'protected-mode', 'bind'];
const SPECIAL_NAMES = new Set(['include', 'loadmodule', 'rename-command', 'aclfile', 'user']);
const MULTI_VALUE_NAMES = new Set(['save', 'client-output-buffer-limit', 'rename-command', 'user', 'loadmodule']);

export function compareLines(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function analyze(
  lines: ParsedLine[],
  dict: DictFile,
  meta: MetaIndex,
  line: string,
  aliases: Record<string, string> = {},
): AnalysisResult {
  const docs = new Map(dict.directives.map((doc) => [doc.name, doc]));
  const byLine = new Map<number, LineAnalysis>();
  const counts = { changed: 0, unknown: 0, removed: 0, newer: 0, duplicate: 0 };
  const occurrences = new Map<string, number[]>();
  const effective = new Map<string, string[]>();
  const firstLineOf = new Map<string, number>();

  const resolve = (name: string) => {
    const direct = docs.get(name);
    if (direct) return { doc: direct, canonical: name };
    const alias = aliases[name];
    const aliased = alias ? docs.get(alias) : undefined;
    if (aliased) return { doc: aliased, canonical: alias };
    return { doc: undefined, canonical: alias ?? name };
  };

  for (const entry of lines) {
    if (entry.kind !== 'directive' || !entry.name) continue;
    const args = entry.args ?? [];
    const { doc, canonical } = resolve(entry.name);
    const list = occurrences.get(canonical) ?? [];
    list.push(entry.lineNo);
    occurrences.set(canonical, list);
    if (!firstLineOf.has(canonical)) firstLineOf.set(canonical, entry.lineNo);

    let status: Status;
    let note: string | undefined;

    if (SPECIAL_NAMES.has(entry.name)) {
      status = 'special';
    } else if (doc) {
      if (doc.defaultValue === null) status = 'no-default';
      else {
        const defaults = tokenizeArgs(doc.defaultValue).args;
        status = normalizeValue(doc, args) === normalizeValue(doc, defaults) ? 'default' : 'changed';
      }
    } else if (meta[canonical]) {
      const entryMeta = meta[canonical];
      if (entryMeta.removedIn && compareLines(entryMeta.removedIn, line) <= 0) {
        status = 'removed';
        note = entryMeta.renamedTo ? `已在 ${entryMeta.removedIn} 移除，改用 ${entryMeta.renamedTo}` : `已在 ${entryMeta.removedIn} 移除`;
      } else if (compareLines(entryMeta.introducedIn, line) > 0) {
        status = 'newer';
        note = `该指令从 ${entryMeta.introducedIn} 才开始支持`;
      } else {
        status = 'unknown';
      }
    } else {
      status = 'unknown';
    }

    if (MULTI_VALUE_NAMES.has(canonical)) {
      effective.set(canonical, args);
    } else {
      effective.set(canonical, args);
      if (list.length > 1) {
        status = 'duplicate';
        note = `同名指令重复，第 ${list.length} 次出现会覆盖前面的值`;
      }
    }

    if (status === 'changed') counts.changed += 1;
    if (status === 'unknown') counts.unknown += 1;
    if (status === 'removed') counts.removed += 1;
    if (status === 'newer') counts.newer += 1;
    if (status === 'duplicate') counts.duplicate += 1;

    byLine.set(entry.lineNo, { lineNo: entry.lineNo, status, doc, note });
  }

  for (const [name, doc] of docs) {
    if (effective.has(name)) continue;
    if (doc.defaultValue === null) continue;
    effective.set(name, tokenizeArgs(doc.defaultValue).args);
  }

  const missing = IMPORTANT.filter((name) => !firstLineOf.has(name));

  return { lines, byLine, counts, missing, firstLineOf, effective };
}
