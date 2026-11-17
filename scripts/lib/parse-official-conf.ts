const NAME_RE = /^[A-Za-z][A-Za-z0-9-]*$/;
const SECTION_RE = /^#{5,}\s*(.+?)\s*#{5,}\s*$/;

export interface OfficialSection {
  id: string;
  title: string;
  startLine: number;
}

export interface OfficialDirective {
  comment: string[];
  commentedValues: string[][];
  section: string;
}

export interface OfficialConf {
  sections: OfficialSection[];
  byName: Map<string, OfficialDirective>;
}

function tokenize(input: string): string[] {
  const args: string[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) {
      i += 1;
    }
    if (i >= input.length) {
      break;
    }
    const quote = input[i];
    if (quote === '"' || quote === "'") {
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
      continue;
    }
    let value = '';
    while (i < input.length && !/\s/.test(input[i])) {
      value += input[i];
      i += 1;
    }
    args.push(value);
  }
  return args;
}

const isDirectiveLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return false;
  }
  return NAME_RE.test(trimmed.split(/\s+/)[0]);
};

export function parseOfficialConf(source: string): OfficialConf {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const sections: OfficialSection[] = [];
  const byName = new Map<string, OfficialDirective>();
  let section = 'MISC';

  const ensure = (name: string): OfficialDirective => {
    let entry = byName.get(name);
    if (!entry) {
      entry = { comment: [], commentedValues: [], section };
      byName.set(name, entry);
    }
    return entry;
  };

  const blockAbove = (index: number): string[] => {
    const block: string[] = [];
    let j = index - 1;
    while (j >= 0 && lines[j].trim().startsWith('#')) {
      block.unshift(lines[j].trim().replace(/^#+\s?/, ''));
      j -= 1;
    }
    while (block.length && block[0] === '') {
      block.shift();
    }
    while (block.length && block[block.length - 1] === '') {
      block.pop();
    }
    return block;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const banner = SECTION_RE.exec(line.trim());
    if (banner) {
      section = banner[1];
      sections.push({ id: section, title: section, startLine: i + 1 });
      continue;
    }

    if (isDirectiveLine(line)) {
      const name = line.trim().split(/\s+/)[0];
      const first = !byName.has(name);
      const entry = ensure(name);
      if (first) {
        entry.comment = blockAbove(i);
      }
      continue;
    }

    const commented = /^\s*#+\s*([A-Za-z][A-Za-z0-9-]*)(?:\s+(.*))?$/.exec(line);
    if (!commented) {
      continue;
    }
    const [, name, rest = ''] = commented;
    // 散文里的首词多是大写开头，配置指令一律小写
    if (name !== name.toLowerCase()) {
      continue;
    }
    const first = !byName.has(name);
    const entry = ensure(name);
    if (first) {
      entry.comment = blockAbove(i);
    }
    if (rest.trim() === '') {
      continue;
    }
    if (rest.includes('#')) {
      continue;
    }
    const args = tokenize(rest);
    if (args.some((arg) => arg.includes('<') || arg.includes('>'))) {
      continue;
    }
    entry.commentedValues.push(args.length === 1 && args[0] === '' ? [] : args);
  }

  return { sections, byName };
}
