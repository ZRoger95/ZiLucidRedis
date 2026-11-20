import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';

import { Root } from '../src/Root';

test('/ 渲染体检页', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Root />
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'Redis 配置体检' })).toBeInTheDocument();
});

test('直接打开 /configurator 渲染向导', async () => {
  render(
    <MemoryRouter initialEntries={['/configurator']}>
      <Root />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: '选择版本' })).toBeInTheDocument();
});

test('点击生成配置进入向导', async () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Root />
    </MemoryRouter>,
  );

  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));

  expect(await screen.findByRole('heading', { name: '选择版本' })).toBeInTheDocument();
});

test('未知路径回到体检页', () => {
  render(
    <MemoryRouter initialEntries={['/nope']}>
      <Root />
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'Redis 配置体检' })).toBeInTheDocument();
});
