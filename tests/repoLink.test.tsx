import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { RepoLink } from '../src/components/RepoLink';

test('图标链接到仓库首页并在新窗口打开', () => {
  render(<RepoLink />);

  const link = screen.getByRole('link', { name: '在 GitHub 上查看源码' });
  expect(link).toHaveAttribute('href', 'https://github.com/ZRoger95/ZiLucidRedis');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
