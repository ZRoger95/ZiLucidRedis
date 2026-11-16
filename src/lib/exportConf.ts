import type { DictFile, ParsedLine } from '../types';
import { restoreSecrets } from './secrets';

export function exportOriginal(text: string): string {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
  return `${rows.join('\n')}\n`;
}

export function exportWithComments(lines: ParsedLine[], dict: DictFile): string {
  const docs = new Map(dict.directives.map((directive) => [directive.name, directive]));
  const output: string[] = [];

  for (const line of lines) {
    if (line.kind === 'directive' && line.name) {
      const doc = docs.get(line.name);
      const previous = lines.find((item) => item.lineNo === line.lineNo - 1);
      if (doc && doc.comment.length > 0 && previous?.kind !== 'comment') {
        for (const row of doc.comment) output.push(row ? `# ${row}` : '#');
        output.push(`# 默认值: ${doc.defaultValue ?? '官方未给出'}`);
      }
    }
    output.push(line.raw);
  }

  while (output.length && output[output.length - 1].trim() === '') output.pop();
  return `${output.join('\n')}\n`;
}

export function exportWithSecrets(text: string, vault: Map<string, string>): string {
  return exportOriginal(restoreSecrets(text, vault));
}

export function suggestFileName(name: string | null): string {
  const source = name?.trim() || 'redis.conf';
  const base = source.replace(/\.conf$/i, '');
  return `${base}-edited.conf`;
}
