import { parseConf } from './parseConf';

export interface NormalizedConfig {
  text: string;
  kept: number;
  droppedComments: number;
  unknown: string[];
}

interface Entry {
  raw: string;
  order: number;
  index: number;
  name: string | null;
}

export function normalizeConfig(text: string, officialIndex: Map<string, number>): NormalizedConfig {
  const entries: Entry[] = [];
  const unknown: string[] = [];
  let droppedComments = 0;

  for (const line of parseConf(text)) {
    if (line.kind === 'directive' && line.name) {
      const order = officialIndex.get(line.name) ?? Number.MAX_SAFE_INTEGER;
      entries.push({ raw: line.raw.trim(), order, index: line.lineNo, name: line.name });
      if (order === Number.MAX_SAFE_INTEGER) unknown.push(line.raw.trim());
      continue;
    }
    if (line.kind === 'unknown') {
      entries.push({ raw: line.raw.trim(), order: Number.MAX_SAFE_INTEGER, index: line.lineNo, name: null });
      unknown.push(line.raw.trim());
      continue;
    }
    if (line.kind === 'comment') droppedComments += 1;
  }

  entries.sort((a, b) => a.order - b.order || a.index - b.index);
  const body = entries.map((entry) => entry.raw).join('\n');

  return {
    text: body ? `${body}\n` : '',
    kept: entries.length,
    droppedComments,
    unknown,
  };
}
