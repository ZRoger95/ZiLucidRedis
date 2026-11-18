import type { AnnotationMode, DirectiveDoc } from '../types';

import { annotationSummary } from './annotations';
import { parseConf } from './parseConf';

const NAME_RE = /^([A-Za-z][A-Za-z0-9-]*)(?:\s|$)/;

export interface OfficialAnnotation {
  summary: string;
  text: string[];
}

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
  zhNotes: Record<string, string> = {},
): Map<number, OfficialAnnotation> {
  const annotations = new Map<number, OfficialAnnotation>();
  if (mode === 'off') {
    return annotations;
  }

  for (let index = 0; index < rows.length; index += 1) {
    const match = NAME_RE.exec(rows[index].trim());
    if (!match) {
      continue;
    }
    const doc = docs.get(match[1]);
    if (!doc || doc.comment.length === 0) {
      continue;
    }

    const hasComment = index > 0 && rows[index - 1].trim().startsWith('#');
    if (mode === 'missing' && hasComment) {
      continue;
    }

    const defaultText = doc.defaultValue === null ? '官方未给出' : doc.defaultValue;
    annotations.set(index + 1, {
      summary: annotationSummary(doc, zhNotes),
      text: [...doc.comment, `默认值: ${defaultText}`],
    });
  }

  return annotations;
}
