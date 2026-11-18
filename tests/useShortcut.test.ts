import { fireEvent, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { useShortcut } from '../src/hooks/useShortcut';

test('mod+k 触发回调并阻止默认行为', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('mod+k', handler));
  const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
  window.dispatchEvent(event);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
});

test('在输入框内同样触发', () => {
  const input = document.createElement('input');
  document.body.append(input);
  const handler = vi.fn();
  renderHook(() => useShortcut('mod+k', handler));
  fireEvent.keyDown(input, { key: 'k', metaKey: true });
  expect(handler).toHaveBeenCalledTimes(1);
});

test('单独 k 或带 shift 不触发', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('mod+k', handler));
  fireEvent.keyDown(window, { key: 'k' });
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true, shiftKey: true });
  expect(handler).not.toHaveBeenCalled();
});

test('mod+f 触发回调并阻止浏览器查找', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('mod+f', handler));
  const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, cancelable: true });
  window.dispatchEvent(event);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
});
