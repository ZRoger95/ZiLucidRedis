import type { DirectiveDoc, LineAnalysis } from '../types';

import { STATUS_LABELS } from './annotations';

export interface DetailView {
  name: string;
  section: string | null;
  defaultText: string;
  currentText: string;
  isDiff: boolean;
  rangeText: string | null;
  statusText: string;
  status: string | null;
  zhText: string | null;
  body: string[];
  docUrl: string;
}

const DOC_URL = 'https://redis.io/docs/latest/operate/oss_and_stack/management/config/';

function formatDefault(value: string | null): string {
  if (value === null) {
    return '官方未给出';
  }
  if (value === '') {
    return '""';
  }
  return value;
}

const STATUS_HINTS: Record<string, string> = {
  unknown: '字典里没有这个指令：可能是拼写错误、模块指令，或者不是你选的 Redis 版本支持的项。',
  removed: '这个指令在当前版本已经不再使用，保留它不会有作用。',
  newer: '这个指令在所选版本里还不存在，启动时会被当成未知参数。',
  duplicate: '同一个指令写了多次，Redis 只保留最后一次的值。',
  special: '特殊指令：作用取决于参数，页面只提示不校验。',
};

export function describeDirective(
  doc: DirectiveDoc | undefined,
  current: LineAnalysis | undefined,
  zhNotes: Record<string, string>,
  showZh: boolean,
  currentArgs: string[] = [],
): DetailView {
  if (!doc) {
    const status = current?.status ?? null;
    return {
      name: '',
      section: null,
      defaultText: '',
      currentText: '',
      isDiff: false,
      rangeText: null,
      statusText: status ? STATUS_LABELS[status] : '',
      status,
      zhText: null,
      body: status ? [STATUS_HINTS[status] ?? '这一行无法识别。'] : ['把光标放到某条配置上查看说明。'],
      docUrl: DOC_URL,
    };
  }

  const defaultText = formatDefault(doc.defaultValue);
  const currentText = currentArgs.length ? currentArgs.join(' ') : '（未写）';
  const status = current?.status ?? null;

  return {
    name: doc.name,
    section: doc.section,
    defaultText,
    currentText,
    isDiff: status === 'changed',
    rangeText: doc.range,
    statusText: status ? STATUS_LABELS[status] : '',
    status,
    zhText: showZh ? (zhNotes[doc.name] ?? null) : null,
    body: doc.comment.length ? doc.comment : ['官方 conf 未提供注释。'],
    docUrl: DOC_URL,
  };
}
