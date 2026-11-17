import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { Toolbar } from '../src/components/Toolbar';

const props = {
  line: '7.4',
  onLineChange: vi.fn(),
  annotationMode: 'missing' as const,
  onAnnotationModeChange: vi.fn(),
  onlyDiff: false,
  onOnlyDiffChange: vi.fn(),
  showZh: true,
  onShowZhChange: vi.fn(),
  onUpload: vi.fn(),
  onLoadOfficial: vi.fn(),
  onClear: vi.fn(),
  onOpenSearch: vi.fn(),
  onExport: vi.fn(),
  canRestoreSecrets: false,
};

test('点击“只看差异”文字也能切换开关', async () => {
  const onOnlyDiffChange = vi.fn();
  render(<Toolbar {...props} onOnlyDiffChange={onOnlyDiffChange} />);
  await userEvent.click(screen.getByText('只看差异'));
  expect(onOnlyDiffChange).toHaveBeenCalledWith(true);
});

test('上传 conf 是可通过键盘聚焦的按钮', () => {
  render(<Toolbar {...props} />);
  const button = screen.getByRole('button', { name: '上传 conf' });
  button.focus();
  expect(button).toHaveFocus();
  expect(button.tagName).toBe('BUTTON');
});
