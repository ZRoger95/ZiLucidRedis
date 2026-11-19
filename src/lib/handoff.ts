export interface PendingConf {
  line: string;
  text: string;
  vault: Map<string, string>;
}

/**
 * 向导带回编辑器的一次性数据。可重复读取：读取不清空，避免 StrictMode 下
 * 渲染期初始化执行两次时把内容吃掉；挂载后由 App 显式清除。
 */
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

/**
 * 编辑器会话（密码 vault、上传文件名）跨页面保留。App 卸载只会丢组件状态，
 * 这些值放在模块内存里，回体检页后仍可「还原密码后导出」。
 */
let sessionVault = new Map<string, string>();
let sessionFileName: string | null = null;

export function keepEditorSession(vault: Map<string, string>, fileName: string | null): void {
  sessionVault = vault;
  sessionFileName = fileName;
}

export function readEditorSession(): { vault: Map<string, string>; fileName: string | null } {
  return { vault: sessionVault, fileName: sessionFileName };
}

/** 进入向导时携带体检页当前版本，只消费一次。 */
let pendingLine: string | null = null;

export function setPendingLine(line: string): void {
  pendingLine = line;
}

export function takePendingLine(): string | null {
  const value = pendingLine;
  pendingLine = null;
  return value;
}
