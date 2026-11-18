import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';

import App from '../src/App';
import { STORAGE_KEY } from '../src/lib/persistence';

afterEach(() => {
  localStorage.clear();
});

test('renders the tool title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Redis 配置体检' })).toBeInTheDocument();
});

test('编辑器标题旁提供行颜色说明', () => {
  render(<App />);
  const legend = screen.getByLabelText('行颜色说明');
  expect(legend).toHaveTextContent('默认值');
  expect(legend).toHaveTextContent('已改');
  expect(legend).toHaveTextContent('未知/重复');
  expect(legend).toHaveTextContent('已移除');
  expect(legend).toHaveTextContent('版本不支持');
  expect(legend).toHaveTextContent('注释块');
});

test('diff 行按 Esc 后焦点回到编辑器', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 1,
      line: '7.4',
      text: 'maxmemory 128mb\n',
      annotationMode: 'off',
      onlyDiff: false,
      showZh: false,
      bottomCollapsed: false,
    }),
  );

  const { container } = render(<App />);

  await userEvent.click(screen.getByRole('tab', { name: '配置对比' }));

  const row = await waitFor(() => {
    const found = container.querySelector<HTMLElement>('[data-slot="diff-row"]');
    if (!found) {
      throw new Error('diff 行尚未渲染');
    }
    return found;
  });

  await act(async () => {
    row.focus();
  });
  await userEvent.keyboard('{Escape}');

  await waitFor(() => {
    expect(document.activeElement).toHaveClass('cm-content');
  });
});

test('默认展示体检结果', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 1,
      line: '7.4',
      text: 'maxmemory 128mb\n',
      annotationMode: 'off',
      onlyDiff: false,
      showZh: false,
      bottomCollapsed: false,
    }),
  );

  render(<App />);

  expect(await screen.findByRole('tab', { name: '体检结果', selected: true })).toBeInTheDocument();
  expect(await screen.findByRole('list', { name: '已改' })).toBeInTheDocument();
});

test('点击无默认值的缺失项打开搜索面板', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 1,
      line: '7.4',
      text: 'maxmemory 128mb\n',
      annotationMode: 'off',
      onlyDiff: false,
      showZh: false,
      bottomCollapsed: false,
    }),
  );

  render(<App />);

  await userEvent.click(await screen.findByRole('button', { name: /bind/ }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

test('字典里没有的缺失项也打开搜索面板', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 1,
      line: '6.2',
      text: 'maxmemory 128mb\n',
      annotationMode: 'off',
      onlyDiff: false,
      showZh: false,
      bottomCollapsed: false,
    }),
  );

  render(<App />);

  await userEvent.click(await screen.findByRole('button', { name: /bind/ }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

test('mod+f 默认打开左栏查找', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 1,
      line: '7.4',
      text: 'maxmemory 128mb\n',
      annotationMode: 'off',
      onlyDiff: false,
      showZh: false,
      bottomCollapsed: false,
    }),
  );

  const { container } = render(<App />);
  await waitFor(() => {
    expect(container.querySelector('.cm-content')).not.toBeNull();
  });

  fireEvent.keyDown(window, { key: 'f', ctrlKey: true, cancelable: true });
  expect(await screen.findByRole('search', { name: '在你的配置中查找' })).toBeInTheDocument();
  expect(screen.queryByRole('search', { name: '在官方配置中查找' })).toBeNull();
});

test('在右栏按 mod+f 只打开右栏查找', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 1,
      line: '7.4',
      text: 'maxmemory 128mb\n',
      annotationMode: 'off',
      onlyDiff: false,
      showZh: false,
      bottomCollapsed: false,
    }),
  );

  render(<App />);
  await screen.findByText(/官方完整配置 · /);
  fireEvent.pointerDown(screen.getByRole('region', { name: '官方完整配置' }));

  fireEvent.keyDown(window, { key: 'f', ctrlKey: true, cancelable: true });
  expect(await screen.findByRole('search', { name: '在官方配置中查找' })).toBeInTheDocument();
  expect(screen.queryByRole('search', { name: '在你的配置中查找' })).toBeNull();
});
