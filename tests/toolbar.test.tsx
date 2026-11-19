import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { Toolbar } from '../src/components/Toolbar';

const props = {
  line: '7.4',
  onLineChange: vi.fn(),
  annotationMode: 'missing' as const,
  onAnnotationModeChange: vi.fn(),
  showZh: true,
  onShowZhChange: vi.fn(),
  onUpload: vi.fn(),
  onLoadOfficial: vi.fn(),
  onGenerate: vi.fn(),
  onClear: vi.fn(),
  onOpenSearch: vi.fn(),
  onExport: vi.fn(),
  canRestoreSecrets: false,
};

test('上传 conf 是可通过键盘聚焦的按钮', () => {
  render(<Toolbar {...props} />);
  const button = screen.getByRole('button', { name: '上传 conf' });
  button.focus();
  expect(button).toHaveFocus();
  expect(button.tagName).toBe('BUTTON');
});

test('生成配置按钮触发回调', async () => {
  const onGenerate = vi.fn();
  render(<Toolbar {...props} onGenerate={onGenerate} />);

  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));

  expect(onGenerate).toHaveBeenCalledTimes(1);
});
