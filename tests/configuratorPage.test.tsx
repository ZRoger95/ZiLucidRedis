import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { ConfiguratorPage } from '../src/components/configurator/ConfiguratorPage';

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
