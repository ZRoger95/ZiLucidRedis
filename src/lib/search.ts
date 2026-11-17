import type { DictFile, DirectiveDoc, ParsedLine } from '../types';

import zhNotes from '../data/zh-notes.json';

export interface SearchHit {
  name: string;
  section: string;
  summary: string | null;
  defaultValue: string | null;
  configured: boolean;
}

const notes = zhNotes as Record<string, string>;

export function searchDirectives(dict: DictFile, query: string, configured: Set<string>): SearchHit[] {
  const needle = query.trim().toLowerCase();
  const hits: { hit: SearchHit; score: number }[] = [];

  for (const directive of dict.directives) {
    const summary = notes[directive.name] ?? null;
    const comment = directive.comment.join(' ');
    let score = 0;

    if (!needle) {
      score = 1;
    } else if (directive.name.toLowerCase().includes(needle)) {
      score = 3;
    } else if (summary?.toLowerCase().includes(needle)) {
      score = 2;
    } else if (comment.toLowerCase().includes(needle)) {
      score = 1;
    }

    if (!score) {
      continue;
    }
    hits.push({
      score,
      hit: {
        name: directive.name,
        section: directive.section,
        summary,
        defaultValue: directive.defaultValue,
        configured: configured.has(directive.name),
      },
    });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.hit.name.localeCompare(b.hit.name))
    .slice(0, 50)
    .map((entry) => entry.hit);
}

export function insertDirective(
  text: string,
  lines: ParsedLine[],
  doc: DirectiveDoc,
  dict: DictFile,
): { text: string; lineNo: number } {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  const sectionOrder = new Map(dict.sections.map((section, index) => [section.id, index]));
  const docs = new Map(dict.directives.map((directive) => [directive.name, directive]));
  const targetIndex = sectionOrder.get(doc.section) ?? -1;
  const content = doc.defaultValue === null ? `# ${doc.name} <${doc.type}>` : `${doc.name} ${doc.defaultValue}`;

  let insertAt = -1;

  for (let i = 0; i < rows.length; i += 1) {
    const banner = /^#{5,}\s*(.+?)\s*#{5,}\s*$/.exec(rows[i].trim());
    if (!banner) {
      continue;
    }
    const index = sectionOrder.get(banner[1]);
    if (index !== undefined && index > targetIndex) {
      insertAt = i;
      break;
    }
  }

  if (insertAt < 0) {
    for (const line of lines) {
      if (line.kind !== 'directive' || !line.name) {
        continue;
      }
      const directive = docs.get(line.name);
      const index = directive ? (sectionOrder.get(directive.section) ?? -1) : -1;
      if (index > targetIndex) {
        insertAt = line.lineNo - 1;
        break;
      }
    }
  }

  if (insertAt < 0) {
    const body = rows[rows.length - 1] === '' ? rows.slice(0, -1) : rows;
    const next = [...body, '', content, ''];
    return { text: next.join('\n'), lineNo: body.length + 2 };
  }

  const next = [...rows.slice(0, insertAt), content, ...rows.slice(insertAt)];
  return { text: next.join('\n'), lineNo: insertAt + 1 };
}
