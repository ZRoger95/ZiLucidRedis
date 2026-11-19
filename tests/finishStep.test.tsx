import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { FinishStep } from '../src/components/configurator/FinishStep';

const props = {
  line: '7.4',
  text: 'port 6380\nsave 900 1\n',
  changed: 2,
  hasSecret: false,
  onBack: vi.fn(),
  onDownload: vi.fn(),
  onHandoff: vi.fn(),
};

test('展示改动数与生成结果预览', () => {
  render(<FinishStep {...props} />);

  expect(screen.getByRole('heading', { name: '完成' })).toBeInTheDocument();
  expect(screen.getByText('共改 2 项')).toBeInTheDocument();
  expect(screen.getByText(/port 6380/)).toBeInTheDocument();
});

test('含敏感值时提示明文风险', () => {
  render(<FinishStep {...props} hasSecret />);

  expect(screen.getByText(/包含明文密码/)).toBeInTheDocument();
});

test('下载、带回与返回修改分别触发回调', async () => {
  const onBack = vi.fn();
  const onDownload = vi.fn();
  const onHandoff = vi.fn();
  render(<FinishStep {...props} onBack={onBack} onDownload={onDownload} onHandoff={onHandoff} />);

  await userEvent.click(screen.getByRole('button', { name: '下载 conf' }));
  await userEvent.click(screen.getByRole('button', { name: '带回体检页' }));
  await userEvent.click(screen.getByRole('button', { name: '返回修改' }));

  expect(onDownload).toHaveBeenCalledTimes(1);
  expect(onHandoff).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
});
