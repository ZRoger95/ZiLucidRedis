import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { OfficialPane, rowCurrentFrom } from '../src/components/OfficialPane';

const props = {
  text: 'maxmemory 0\nmaxmemory-policy allkeys-lru\n',
  tag: '8.2',
  dict: null,
  zhNotes: {},
  annotationMode: 'off' as const,
  highlightLines: new Set<number>(),
  focus: null,
};

test('命中渲染为 mark 并显示计数', async () => {
  const { rerender } = render(<OfficialPane {...props} findRequest={0} />);
  rerender(<OfficialPane {...props} findRequest={1} />);
  const input = await screen.findByRole('searchbox', { name: '在官方配置中查找' });

  await userEvent.type(input, 'maxmemory');
  await waitFor(() => {
    expect(document.querySelectorAll('mark')).toHaveLength(2);
  });
  expect(screen.getByText('1/2')).toBeInTheDocument();
});

test('Enter 切换当前命中并滚动到对应行', async () => {
  const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
  const { rerender } = render(<OfficialPane {...props} findRequest={0} />);
  rerender(<OfficialPane {...props} findRequest={1} />);
  const input = await screen.findByRole('searchbox', { name: '在官方配置中查找' });
  await userEvent.type(input, 'maxmemory');
  await userEvent.type(input, '{Enter}');

  expect(await screen.findByText('2/2')).toBeInTheDocument();
  expect(scroll).toHaveBeenCalled();
  scroll.mockRestore();
});

test('未命中行不接收当前命中偏移', () => {
  const active = { from: 10, to: 19, lineNo: 1 };
  expect(rowCurrentFrom(undefined, active)).toBe(-1);
  expect(rowCurrentFrom([active], active)).toBe(10);
});

test('关闭后焦点落到右栏滚动容器', async () => {
  const { rerender } = render(<OfficialPane {...props} findRequest={0} />);
  rerender(<OfficialPane {...props} findRequest={1} />);
  await screen.findByRole('searchbox', { name: '在官方配置中查找' });
  await userEvent.click(screen.getByRole('button', { name: '关闭查找' }));

  await waitFor(() => {
    expect(screen.queryByRole('search', { name: '在官方配置中查找' })).toBeNull();
  });
  expect(document.activeElement).toHaveAttribute('data-official-scroll');
});
