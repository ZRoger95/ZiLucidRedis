import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { ExportMenu } from '../src/components/ExportMenu';

test('无占位符时第三项禁用且不触发导出', async () => {
  const onExport = vi.fn();
  render(<ExportMenu onExport={onExport} canRestoreSecrets={false} />);
  await userEvent.click(screen.getByRole('button', { name: '导出' }));
  const item = screen.getByRole('menuitem', { name: /还原密码后导出/ });
  expect(item).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(item);
  expect(onExport).not.toHaveBeenCalled();
});

test('点击第一项导出原样内容', async () => {
  const onExport = vi.fn();
  render(<ExportMenu onExport={onExport} canRestoreSecrets />);
  await userEvent.click(screen.getByRole('button', { name: '导出' }));
  await userEvent.click(screen.getByRole('menuitem', { name: /原样导出/ }));
  expect(onExport).toHaveBeenCalledWith('original');
});
