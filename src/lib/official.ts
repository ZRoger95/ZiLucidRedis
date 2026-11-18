import type { AnnotationMode, DirectiveDoc } from '../types';

import { annotationSummary } from './annotations';
import { parseConf } from './parseConf';

const NAME_RE = /^([A-Za-z][A-Za-z0-9-]*)(?:\s|$)/;

export interface OfficialAnnotation {
  summary: string;
  text: string[];
}

/**
 * 官方 conf 里大多数配置项只以注释形式给出默认值（例如 `# save 3600 1 ...`），
 * 只索引未注释的行会导致这些项在右侧面板定位不到。这里优先取真实指令行，
 * 其次取注释里的具体默认值行，最后退到带 `<>` 的模板说明行。
 */
export function indexOfficialLines(text: string, knownNames: Set<string>): Map<string, number> {
  const index = new Map<string, number>();
  const concrete = new Map<string, number>();
  const templated = new Map<string, number>();

  for (const line of parseConf(text)) {
    if (line.kind === 'directive' && line.name) {
      if (!index.has(line.name)) {
        index.set(line.name, line.lineNo);
      }
      continue;
    }
    if (line.kind !== 'comment') {
      continue;
    }

    const content = line.raw.trim().replace(/^#+\s*/, '');
    const name = content.split(/\s+/)[0];
    if (!content || !knownNames.has(name)) {
      continue;
    }
    const target = /[<>|[\]]/.test(content) ? templated : concrete;
    target.set(name, line.lineNo);
  }

  for (const fallback of [concrete, templated]) {
    for (const [name, lineNo] of fallback) {
      if (!index.has(name)) {
        index.set(name, lineNo);
      }
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
