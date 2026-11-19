import type { ConfiguratorDraft, ConfiguratorStep, DictFile, DirectiveDoc, FreeLineKind } from '../types';

import { SECTION_FREE_LINES } from './freeLines';

const BANNER_RE = /^#{5,}\s+(.+?)\s+#{2,}$/;
const PLACEHOLDER_RE = /[<|[\]]/;
const FREE_LINE_TITLES: Record<FreeLineKind, string> = {
  include: '# 配置向导：include',
  loadmodule: '# 配置向导：loadmodule',
  user: '# 配置向导：ACL 用户',
  renameCommand: '# 配置向导：重命名命令',
};

function bannerTitle(line: string): string | null {
  const match = BANNER_RE.exec(line.trim());
  return match ? match[1] : null;
}

function findBanner(lines: string[], sectionId: string): number {
  return lines.findIndex((line) => bannerTitle(line) === sectionId);
}

function sectionEnd(lines: string[], sectionId: string): number {
  const start = findBanner(lines, sectionId);
  if (start < 0) {
    return -1;
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (bannerTitle(lines[index]) !== null) {
      end = index;
      break;
    }
  }
  while (end > start && lines[end - 1].trim() === '') {
    end -= 1;
  }
  return end;
}

function stripped(line: string): string {
  return line.trim().replace(/^#+\s*/, '');
}

function occurrencesOf(lines: string[], name: string): number[] {
  const indexes: number[] = [];
  for (const [index, line] of lines.entries()) {
    const content = stripped(line);
    if (content === name || content.startsWith(`${name} `) || content.startsWith(`${name}\t`)) {
      indexes.push(index);
    }
  }
  return indexes;
}

function rowsFor(name: string, value: string): string[] {
  return value
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => `${name} ${row}`);
}

export function buildSteps(dict: DictFile): ConfiguratorStep[] {
  const steps: ConfiguratorStep[] = [
    { id: '__version__', kind: 'version', title: '选择版本', directives: [], freeLines: [] },
  ];
  const grouped = new Map<string, DirectiveDoc[]>();

  for (const directive of dict.directives) {
    const list = grouped.get(directive.section) ?? [];
    list.push(directive);
    grouped.set(directive.section, list);
  }

  for (const section of dict.sections) {
    steps.push({
      id: section.id,
      kind: 'section',
      title: section.title,
      directives: grouped.get(section.id) ?? [],
      freeLines: SECTION_FREE_LINES[section.id] ?? [],
    });
  }

  const misc = grouped.get('MISC') ?? [];
  if (misc.length > 0) {
    steps.push({ id: 'MISC', kind: 'extra', title: 'MISC', directives: misc, freeLines: [] });
  }

  steps.push({ id: '__finish__', kind: 'finish', title: '完成', directives: [], freeLines: [] });
  return steps;
}

export function emptyDraft(line: string): ConfiguratorDraft {
  return { v: 1, line, values: {}, include: [], loadmodule: [], user: [], renameCommand: [] };
}

export function changeCount(draft: ConfiguratorDraft): number {
  return (
    Object.keys(draft.values).length +
    draft.include.length +
    draft.loadmodule.length +
    draft.user.length +
    draft.renameCommand.length
  );
}

function freeLineRows(kind: FreeLineKind, draft: ConfiguratorDraft): string[] {
  if (kind === 'include') {
    const rows = draft.include.map((value) => value.trim()).filter(Boolean);
    return rows.length ? [FREE_LINE_TITLES.include, ...rows.map((row) => `include ${row}`)] : [];
  }
  if (kind === 'loadmodule') {
    const rows = draft.loadmodule.map((value) => value.trim()).filter(Boolean);
    return rows.length ? [FREE_LINE_TITLES.loadmodule, ...rows.map((row) => `loadmodule ${row}`)] : [];
  }
  if (kind === 'user') {
    const rows = draft.user.map((value) => value.trim()).filter(Boolean);
    return rows.length ? [FREE_LINE_TITLES.user, ...rows] : [];
  }
  const rows = draft.renameCommand.filter((row) => row.command.trim());
  return rows.length
    ? [
        FREE_LINE_TITLES.renameCommand,
        ...rows.map((row) => `rename-command ${row.command.trim()} "${row.target.trim().replace(/"/g, '\\"')}"`),
      ]
    : [];
}

export function renderConfig(officialText: string, dict: DictFile, draft: ConfiguratorDraft): string {
  const lines = officialText.replace(/\r\n?/g, '\n').split('\n');
  const knownNames = new Set(dict.directives.map((directive) => directive.name));
  const unplaced: string[] = [];

  for (const [name, rawValue] of Object.entries(draft.values)) {
    const value = rawValue.trim();
    if (!value) {
      continue;
    }
    const rows = rowsFor(name, value);
    if (!knownNames.has(name)) {
      unplaced.push(...rows);
      continue;
    }
    const occurrences = occurrencesOf(lines, name);

    if (occurrences.length === 0) {
      unplaced.push(...rows);
      continue;
    }

    const placement = occurrences.find((index) => !PLACEHOLDER_RE.test(stripped(lines[index]))) ?? occurrences[0];
    for (const index of occurrences) {
      if (index !== placement && !lines[index].trimStart().startsWith('#')) {
        lines[index] = `# ${lines[index]}`;
      }
    }
    lines.splice(placement, 1, ...rows);
  }

  const insertions: Array<{ at: number; rows: string[] }> = [];
  for (const [sectionId, kinds] of Object.entries(SECTION_FREE_LINES)) {
    const rows = kinds.flatMap((kind) => freeLineRows(kind, draft));
    if (rows.length === 0) {
      continue;
    }
    const at = sectionEnd(lines, sectionId);
    insertions.push({ at: at < 0 ? lines.length : at, rows });
  }

  for (const { at, rows } of insertions.sort((left, right) => right.at - left.at)) {
    lines.splice(at, 0, ...rows);
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  if (unplaced.length > 0) {
    lines.push('', '# 官方模板未收录的指令（来自 config.c）', ...unplaced);
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  return `${lines.join('\n')}\n`;
}

export function sectionComment(officialText: string, sectionId: string): string[] {
  const lines = officialText.replace(/\r\n?/g, '\n').split('\n');
  const start = findBanner(lines, sectionId);
  if (start < 0) {
    return [];
  }

  const rows: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      rows.push('');
      continue;
    }
    if (bannerTitle(trimmed) !== null || !trimmed.startsWith('#')) {
      break;
    }
    rows.push(trimmed.replace(/^#\s?/, ''));
  }

  while (rows.length > 0 && rows[0] === '') {
    rows.shift();
  }
  while (rows.length > 0 && rows[rows.length - 1] === '') {
    rows.pop();
  }
  return rows;
}
