import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test } from 'vitest';

import App from '../src/App';
import { setPendingConf } from '../src/lib/handoff';
import { STORAGE_KEY } from '../src/lib/persistence';

afterEach(() => {
  localStorage.clear();
});

test('renders the tool title', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Redis 配置体检' })).toBeInTheDocument();
});

test('从向导带回的配置进入编辑器', async () => {
  setPendingConf({ line: '7.4', text: 'port 6380\n', vault: new Map() });
  const { container } = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(container.querySelector('.cm-content')?.textContent).toContain('port 6380');
  });
});

test('切到向导再回来，密码 vault 仍可还原', async () => {
  setPendingConf({
    line: '7.4',
    text: 'requirepass ${env_requirepass}\n',
    vault: new Map([['requirepass#1', 'secret']]),
  });
  const first = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(first.container.querySelector('.cm-content')?.textContent).toContain('${env_requirepass}');
  });
  first.unmount();

  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: '导出' }));
  const item = await screen.findByRole('menuitem', { name: /还原密码后导出/ });
  expect(item.getAttribute('aria-disabled')).not.toBe('true');
});

test('编辑器标题旁提供行颜色说明', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
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

  const { container } = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

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

  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

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

  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

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

  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

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

  const { container } = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
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

  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText(/官方完整配置 · /);
  fireEvent.pointerDown(screen.getByRole('region', { name: '官方完整配置' }));

  fireEvent.keyDown(window, { key: 'f', ctrlKey: true, cancelable: true });
  expect(await screen.findByRole('search', { name: '在官方配置中查找' })).toBeInTheDocument();
  expect(screen.queryByRole('search', { name: '在你的配置中查找' })).toBeNull();
});
