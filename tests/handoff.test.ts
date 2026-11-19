import { expect, test } from 'vitest';

import {
  clearPendingConf,
  keepEditorSession,
  peekPendingConf,
  readEditorSession,
  setPendingConf,
  setPendingLine,
  takePendingLine,
} from '../src/lib/handoff';

test('交接内容可重复读取，直到显式清除', () => {
  setPendingConf({
    line: '7.4',
    text: 'port 6380\n',
    vault: new Map([['requirepass#1', 'secret']]),
  });

  expect(peekPendingConf()?.line).toBe('7.4');
  expect(peekPendingConf()?.text).toBe('port 6380\n');
  expect(peekPendingConf()?.vault.get('requirepass#1')).toBe('secret');

  clearPendingConf();
  expect(peekPendingConf()).toBeNull();
});

test('编辑器会话在页面切换后仍然保留', () => {
  const vault = new Map([['requirepass#1', 'secret']]);
  keepEditorSession(vault, 'my.conf');

  expect(readEditorSession().vault).toBe(vault);
  expect(readEditorSession().fileName).toBe('my.conf');
});

test('进入向导时携带的版本只消费一次', () => {
  setPendingLine('8.2');
  expect(takePendingLine()).toBe('8.2');
  expect(takePendingLine()).toBeNull();
});
