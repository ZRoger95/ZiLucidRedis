import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { ConfiguratorPage } from '../src/components/configurator/ConfiguratorPage';
import { takePendingConf } from '../src/lib/handoff';

afterEach(() => {
  localStorage.clear();
  takePendingConf();
});

async function nextTimes(times: number): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  }
}

async function goToFinish(): Promise<void> {
  let guard = 0;
  while (!(screen.getByRole('button', { name: '下一步' }) as HTMLButtonElement).disabled && guard < 40) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }));
    guard += 1;
  }
}

test('向导加载后显示版本选择与区域导航', async () => {
  render(<ConfiguratorPage />);

  expect(await screen.findByRole('heading', { name: '选择版本' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  expect(within(nav).getByText('包含其他配置文件')).toBeInTheDocument();
  expect(within(nav).getByText('选择版本')).toBeInTheDocument();
  expect(within(nav).getByText('完成')).toBeInTheDocument();
});

test('下一步进入 INCLUDES 区域', async () => {
  render(<ConfiguratorPage />);
  await screen.findByRole('heading', { name: '选择版本' });

  await userEvent.click(screen.getByRole('button', { name: '下一步' }));

  expect(screen.getByRole('heading', { name: 'INCLUDES' })).toBeInTheDocument();
  expect(
    screen.getByText('包含其他配置文件 · 在主配置靠前位置引入额外 conf；后加载的值会覆盖先前的'),
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'include 路径' })).toBeInTheDocument();
});

test('区域步展示可编辑字段', async () => {
  render(<ConfiguratorPage />);
  await screen.findByRole('heading', { name: '选择版本' });

  for (let index = 0; index < 3; index += 1) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  }

  expect(screen.getByRole('heading', { name: 'NETWORK' })).toBeInTheDocument();
  expect(screen.getByLabelText('port')).toHaveValue('');
});

test('编辑字段后导航与本页改动数同步', async () => {
  render(<ConfiguratorPage />);
  await screen.findByRole('heading', { name: '选择版本' });

  for (let index = 0; index < 3; index += 1) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  }

  await userEvent.type(screen.getByLabelText('port'), '6380');

  expect(screen.getByText('已改 1 项')).toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: '配置步骤' })).getByText('1')).toBeInTheDocument();
});

test('上一步在第一步禁用，最后一步不能继续', async () => {
  render(<ConfiguratorPage />);
  await screen.findByRole('heading', { name: '选择版本' });

  expect(screen.getByRole('button', { name: '上一步' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();
});

test('非敏感改动在重新挂载后恢复', async () => {
  const first = render(<ConfiguratorPage />);
  await screen.findByRole('heading', { name: '选择版本' });
  await nextTimes(3);
  await userEvent.type(screen.getByLabelText('port'), '6380');
  first.unmount();

  render(<ConfiguratorPage />);
  await screen.findByRole('heading', { name: '选择版本' });
  await nextTimes(3);

  expect(screen.getByLabelText('port')).toHaveValue('6380');
});

test('完成页可以带回编辑器', async () => {
  render(<ConfiguratorPage />);
  await screen.findByRole('heading', { name: '选择版本' });
  await nextTimes(3);
  await userEvent.type(screen.getByLabelText('port'), '6380');

  await goToFinish();
  expect(screen.getByRole('heading', { name: '完成' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '带回体检页' }));

  const pending = takePendingConf();
  expect(pending?.line).toBe('7.4');
  expect(pending?.text).toContain('port 6380');
});

test('完成页可以下载 conf', async () => {
  const createObjectURL = vi.fn(() => 'blob:x');
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  render(<ConfiguratorPage />);
  await screen.findByRole('heading', { name: '选择版本' });
  await goToFinish();
  await userEvent.click(screen.getByRole('button', { name: '下载 conf' }));

  expect(createObjectURL).toHaveBeenCalledTimes(1);
  click.mockRestore();
});
