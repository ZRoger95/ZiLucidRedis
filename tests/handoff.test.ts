import { expect, test } from 'vitest';

import { setPendingConf, takePendingConf } from '../src/lib/handoff';

test('交接内容只能被取走一次', () => {
  setPendingConf({
    line: '7.4',
    text: 'port 6380\n',
    vault: new Map([['requirepass#1', 'secret']]),
  });

  const first = takePendingConf();
  expect(first?.line).toBe('7.4');
  expect(first?.text).toBe('port 6380\n');
  expect(first?.vault.get('requirepass#1')).toBe('secret');
  expect(takePendingConf()).toBeNull();
});
