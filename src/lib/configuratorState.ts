import type { ConfiguratorDraft, DictFile } from '../types';

import { emptyDraft } from './configurator';

export const DRAFT_KEY = 'zilucidredis.configurator.v1';

/** 落盘前剔除敏感字段与 ACL 用户行；其余改动（含 include 路径）保留。 */
export function draftForStorage(draft: ConfiguratorDraft, dict: DictFile): ConfiguratorDraft {
  const sensitive = new Set(
    dict.directives.filter((directive) => directive.sensitive).map((directive) => directive.name),
  );
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(draft.values)) {
    if (!sensitive.has(name)) {
      values[name] = value;
    }
  }
  return { ...draft, values, user: [] };
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
