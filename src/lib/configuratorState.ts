import type { ConfiguratorDraft, DictFile } from '../types';

import { emptyDraft } from './configurator';

export const DRAFT_KEY = 'zilucidredis.configurator.v1';
export const DRAFT_LINE_KEY = 'zilucidredis.configurator.line';

export function saveDraftLine(line: string): void {
  localStorage.setItem(DRAFT_LINE_KEY, line);
}

export function loadDraftLine(): string | null {
  return localStorage.getItem(DRAFT_LINE_KEY);
}

export function draftForStorage(draft: ConfiguratorDraft, dict: DictFile): ConfiguratorDraft {
  const sensitive = new Set(
    dict.directives.filter((directive) => directive.sensitive).map((directive) => directive.name),
  );
  const stripValues = (values: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(values).filter(([name]) => !sensitive.has(name) && name !== 'auth-pass'));
  const scenario = draft.scenario
    ? {
        ...draft.scenario,
        answers: { ...draft.scenario.answers, password: undefined },
        applied: stripValues(draft.scenario.applied),
        nodes: draft.scenario.nodes?.map((node) => ({ ...node, values: stripValues(node.values) })),
      }
    : undefined;
  return { ...draft, values: stripValues(draft.values), user: [], scenario };
}

export function saveDraft(draft: ConfiguratorDraft, dict: DictFile): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draftForStorage(draft, dict)));
}

export function loadDraft(line: string): ConfiguratorDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ConfiguratorDraft;
    if (parsed.v !== 1 || parsed.line !== line) {
      return null;
    }
    return { ...emptyDraft(line), ...parsed, v: 1, line };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}
