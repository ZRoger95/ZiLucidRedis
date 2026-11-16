import type { AnnotationMode, DirectiveDoc } from '../types';
import { parseConf } from './parseConf';

const NAME_RE = /^([A-Za-z][A-Za-z0-9-]*)(?:\s|$)/;

export function indexOfficialLines(text: string): Map<string, number> {
  const index = new Map<string, number>();
  for (const line of parseConf(text)) {
    if (line.kind === 'directive' && line.name && !index.has(line.name)) {
      index.set(line.name, line.lineNo);
    }
  }
  return index;
}

export function officialAnnotations(
  rows: string[],
  docs: Map<string, DirectiveDoc>,
  mode: AnnotationMode,
): Map<number, string[]> {
  const annotations = new Map<number, string[]>();
  if (mode === 'off') return annotations;

  for (let index = 0; index < rows.length; index += 1) {
    const match = NAME_RE.exec(rows[index].trim());
    if (!match) continue;
    const doc = docs.get(match[1]);
    if (!doc || doc.comment.length === 0) continue;

    const hasComment = index > 0 && rows[index - 1].trim().startsWith('#');
    if (mode === 'missing' && hasComment) continue;

    const defaultText = doc.defaultValue === null ? '官方未给出' : doc.defaultValue;
    annotations.set(index + 1, [...doc.comment, `默认值: ${defaultText}`]);
  }

  return annotations;
}
