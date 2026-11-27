import type { PersistedState } from '../types';

export const STORAGE_KEY = 'zilucid:state';

const PLAINTEXT_SECRET =
  /^\s*(requirepass|masterauth|tls-key-file-pass|tls-client-key-file-pass)\s+(?!["']?\$\{env_)(\S+)/m;

const PLAINTEXT_USER_SECRET = /^\s*user\b[^\n]*\s>(?!["']?\$\{env_)\S+/m;

const PLAINTEXT_SENTINEL = /^\s*sentinel\s+auth-pass\s+\S+\s+(?!["']?\$\{env_)\S+/m;

export function saveState(state: PersistedState): void {
  if (
    PLAINTEXT_SECRET.test(state.text) ||
    PLAINTEXT_USER_SECRET.test(state.text) ||
    PLAINTEXT_SENTINEL.test(state.text)
  ) {
    throw new Error('拒绝持久化明文密码：导入时应先替换为 ${env_*} 占位符');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadState(): PersistedState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.v !== 1 || typeof parsed.text !== 'string' || typeof parsed.line !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
