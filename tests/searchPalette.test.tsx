import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { DictFile } from '../src/types';

import { SearchPalette } from '../src/components/SearchPalette';

const dict: DictFile = {
  line: '7.4',
  tag: '7.4.0',
  sections: [{ id: 'general', title: 'General', startLine: 1 }],
  directives: [
    {
      name: 'maxmemory',
      section: 'general',
      type: 'memory',
      defaultValue: '0',
      defaultSource: 'conf-comment',
      range: null,
      sensitive: false,
      modifiable: true,
      comment: ['memory limit'],
    },
  ],
};

test('输入后回车插入匹配项', async () => {
  const onPick = vi.fn();
  render(<SearchPalette open onOpenChange={vi.fn()} dict={dict} configured={new Set()} onPick={onPick} />);
  await userEvent.type(screen.getByRole('combobox'), 'maxmemory');
  await userEvent.keyboard('{Enter}');
  expect(onPick).toHaveBeenCalledWith('maxmemory', false);
});

test('没有匹配项时回车不插入', async () => {
  const onPick = vi.fn();
  render(<SearchPalette open onOpenChange={vi.fn()} dict={dict} configured={new Set()} onPick={onPick} />);
  await userEvent.type(screen.getByRole('combobox'), 'zzzz');
  await userEvent.keyboard('{Enter}');
  expect(onPick).not.toHaveBeenCalled();
  expect(screen.getByText('没有匹配的配置项。')).toBeInTheDocument();
});
