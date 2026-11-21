export interface PendingConf {
  line: string;
  text: string;
  vault: Map<string, string>;
}

let pending: PendingConf | null = null;

export function setPendingConf(next: PendingConf): void {
  pending = next;
}

export function peekPendingConf(): PendingConf | null {
  return pending;
}

export function clearPendingConf(): void {
  pending = null;
}

let sessionVault = new Map<string, string>();
let sessionFileName: string | null = null;

export function keepEditorSession(vault: Map<string, string>, fileName: string | null): void {
  sessionVault = vault;
  sessionFileName = fileName;
}

export function readEditorSession(): { vault: Map<string, string>; fileName: string | null } {
  return { vault: sessionVault, fileName: sessionFileName };
}

let pendingLine: string | null = null;

export function setPendingLine(line: string): void {
  pendingLine = line;
}

export function takePendingLine(): string | null {
  const value = pendingLine;
  pendingLine = null;
  return value;
}
