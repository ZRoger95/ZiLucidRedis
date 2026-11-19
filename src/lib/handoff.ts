export interface PendingConf {
  line: string;
  text: string;
  vault: Map<string, string>;
}

/**
 * 向导带回编辑器的一次性通道。明文只走内存，不写任何存储；
 * 调用方需先经过 replaceSecrets 再把文本放进来。
 */
let pending: PendingConf | null = null;

export function setPendingConf(next: PendingConf): void {
  pending = next;
}

export function takePendingConf(): PendingConf | null {
  const value = pending;
  pending = null;
  return value;
}
