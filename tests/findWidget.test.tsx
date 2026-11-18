import { createRef } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { FindWidget } from '../src/components/FindWidget';
import { DEFAULT_FIND_OPTIONS } from '../src/lib/find';

function setup(overrides: Partial<Parameters<typeof FindWidget>[0]> = {}) {
  const props = {
    open: true,
    query: 'maxmemory',
    options: DEFAULT_FIND_OPTIONS,
    matchCount: 3,
    activeIndex: 1,
    invalid: false,
    inputRef: createRef<HTMLInputElement>(),
    onQueryChange: vi.fn(),
    onOptionsChange: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onClose: vi.fn(),
    label: '左栏查找',
    ...overrides,
  };
  render(<FindWidget {...props} />);
  return props;
}

test('显示当前序号与总数', () => {
  setup();
  expect(screen.getByText('2/3')).toBeInTheDocument();
});

test('Enter 下一个、Shift+Enter 上一个、Esc 关闭', async () => {
  const props = setup();
  const input = screen.getByRole('searchbox', { name: '左栏查找' });
  await userEvent.type(input, '{Enter}');
  expect(props.onNext).toHaveBeenCalledTimes(1);
  await userEvent.type(input, '{Shift>}{Enter}{/Shift}');
  expect(props.onPrev).toHaveBeenCalledTimes(1);
  await userEvent.type(input, '{Escape}');
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('输入法组合输入时 Enter 不跳转', () => {
  const props = setup();
  const input = screen.getByRole('searchbox', { name: '左栏查找' });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true, cancelable: true });
  expect(props.onNext).not.toHaveBeenCalled();
});

test('三个开关反映状态并回传新选项', async () => {
  const props = setup({ options: { ...DEFAULT_FIND_OPTIONS, caseSensitive: true } });
  expect(screen.getByRole('button', { name: '区分大小写' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: '全词匹配' }));
  expect(props.onOptionsChange).toHaveBeenCalledWith({ ...DEFAULT_FIND_OPTIONS, caseSensitive: true, wholeWord: true });
});

test('非法正则给出提示', () => {
  setup({ invalid: true, matchCount: 0, activeIndex: -1 });
  expect(screen.getByText('正则无效')).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: '左栏查找' })).toHaveAttribute('aria-invalid', 'true');
});

test('关闭时不渲染', () => {
  setup({ open: false });
  expect(screen.queryByRole('search', { name: '左栏查找' })).toBeNull();
});
