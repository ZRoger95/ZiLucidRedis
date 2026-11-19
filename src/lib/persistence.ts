import type { PersistedState } from '../types';

export const STORAGE_KEY = 'zilucid:state';

const PLAINTEXT_SECRET = /^\s*(requirepass|masterauth|tls-key-file-pass|tls-client-key-file-pass)\s+(?!\$\{env_)(\S+)/m;
// ACL 行的密码是 `>password`；替换后整段变成 ${env_user-pass}，不会再命中。
const PLAINTEXT_USER_SECRET = /^\s*user\b[^\n]*\s>\S+/m;

export function saveState(state: PersistedState): void {
  if (PLAINTEXT_SECRET.test(state.text) || PLAINTEXT_USER_SECRET.test(state.text)) {
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
