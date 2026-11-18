import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { AnalysisResult } from '../src/types';

import { Editor } from '../src/components/Editor';

function analysis(): AnalysisResult {
  return {
    lines: [
      { lineNo: 1, raw: 'maxmemory 128mb', kind: 'directive', name: 'maxmemory' },
      { lineNo: 2, raw: 'save 900 1', kind: 'directive', name: 'save' },
    ],
    byLine: new Map([
      [1, { lineNo: 1, status: 'changed' }],
      [2, { lineNo: 2, status: 'default' }],
    ]),
    counts: { changed: 1, unknown: 0, removed: 0, newer: 0, duplicate: 0 },
    missing: [],
    firstLineOf: new Map(),
    effective: new Map(),
  };
}

const baseProps = {
  value: 'maxmemory 128mb\nsave 900 1',
  result: analysis(),
  blocks: [],
  jumpTo: null,
  onChange: vi.fn(),
  onCursorLine: vi.fn(),
  onCommitComment: vi.fn(),
};

test('mod+f 请求打开查找条并聚焦输入框', async () => {
  const { rerender } = render(<Editor {...baseProps} onlyDiff={false} findRequest={0} />);
  rerender(<Editor {...baseProps} onlyDiff={false} findRequest={1} />);
  expect(await screen.findByRole('searchbox', { name: '在你的配置中查找' })).toHaveFocus();
});

test('输入后高亮命中，Enter 切换当前命中且焦点留在输入框', async () => {
  const { rerender } = render(<Editor {...baseProps} onlyDiff={false} findRequest={0} />);
  rerender(<Editor {...baseProps} onlyDiff={false} findRequest={1} />);
  const input = await screen.findByRole('searchbox', { name: '在你的配置中查找' });

  await userEvent.type(input, '1');
  await waitFor(() => {
    expect(document.querySelectorAll('.cm-find-match')).toHaveLength(2);
    expect(document.querySelectorAll('.cm-find-current')).toHaveLength(1);
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  await userEvent.type(input, '{Enter}');
  await waitFor(() => {
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(document.querySelectorAll('.cm-find-current')).toHaveLength(1);
  });
  expect(input).toHaveFocus();
});

test('关闭后再次 mod+f 保留查询并重新聚焦', async () => {
  const { rerender } = render(<Editor {...baseProps} onlyDiff={false} findRequest={0} />);
  rerender(<Editor {...baseProps} onlyDiff={false} findRequest={1} />);
  const input = await screen.findByRole('searchbox', { name: '在你的配置中查找' });
  await userEvent.type(input, 'maxmemory');
  await userEvent.type(input, '{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('search', { name: '在你的配置中查找' })).toBeNull();
  });

  rerender(<Editor {...baseProps} onlyDiff={false} findRequest={2} />);
  const reopened = await screen.findByRole('searchbox', { name: '在你的配置中查找' });
  expect(reopened).toHaveValue('maxmemory');
  expect(reopened).toHaveFocus();
});

test('Esc 关闭查找条并把焦点交回编辑器', async () => {
  const { rerender } = render(<Editor {...baseProps} onlyDiff={false} findRequest={0} />);
  rerender(<Editor {...baseProps} onlyDiff={false} findRequest={1} />);
  const input = await screen.findByRole('searchbox', { name: '在你的配置中查找' });
  await userEvent.type(input, '{Escape}');

  await waitFor(() => {
    expect(screen.queryByRole('search', { name: '在你的配置中查找' })).toBeNull();
  });
  expect(document.activeElement).toHaveClass('cm-content');
});

test('只看差异时隐藏行不计数', async () => {
  const { rerender } = render(<Editor {...baseProps} onlyDiff findRequest={0} />);
  rerender(<Editor {...baseProps} onlyDiff findRequest={1} />);
  const input = await screen.findByRole('searchbox', { name: '在你的配置中查找' });

  await userEvent.type(input, 'save');
  expect(await screen.findByText('0/0')).toBeInTheDocument();
  expect(document.querySelectorAll('.cm-find-match')).toHaveLength(0);
});
