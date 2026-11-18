import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { CheckupGroup } from '../src/lib/checkup';

import { CheckupPanel } from '../src/components/CheckupPanel';

const groups: CheckupGroup[] = [
  {
    kind: 'warning',
    label: '告警',
    items: [
      { id: 'warning-a', kind: 'warning', label: '编码里写死的风险', lineNo: 7, level: 'high' },
      { id: 'warning-b', kind: 'warning', label: '默认值触发的风险', lineNo: null, level: 'low' },
    ],
  },
  {
    kind: 'missing',
    label: '缺失',
    items: [{ id: 'missing-bind', kind: 'missing', label: 'bind', detail: '未显式配置', lineNo: null }],
  },
  {
    kind: 'changed',
    label: '已改',
    items: [{ id: 'changed-42', kind: 'changed', label: 'maxmemory', detail: 'maxmemory 0', lineNo: 42 }],
  },
];

test('渲染分组标题与计数', () => {
  render(<CheckupPanel groups={groups} hasContent onJump={vi.fn()} onInsertMissing={vi.fn()} />);
  expect(screen.getByText('共 4 项')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: '告警' })).toBeInTheDocument();
});

test('点击有行号明细触发跳转，无行号告警不可点击', async () => {
  const onJump = vi.fn();
  render(<CheckupPanel groups={groups} hasContent onJump={onJump} onInsertMissing={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /编码里写死的风险/ }));
  expect(onJump).toHaveBeenCalledWith(7);
  await userEvent.click(screen.getByRole('button', { name: /maxmemory/ }));
  expect(onJump).toHaveBeenCalledWith(42);
  expect(screen.queryByRole('button', { name: /默认值触发的风险/ })).not.toBeInTheDocument();
});

test('点击缺失项调用 onInsertMissing', async () => {
  const onInsertMissing = vi.fn();
  render(<CheckupPanel groups={groups} hasContent onJump={vi.fn()} onInsertMissing={onInsertMissing} />);
  await userEvent.click(screen.getByRole('button', { name: /bind/ }));
  expect(onInsertMissing).toHaveBeenCalledWith('bind');
});

test('切换筛选后只剩对应分组，空类别给出提示', async () => {
  render(<CheckupPanel groups={groups} hasContent onJump={vi.fn()} onInsertMissing={vi.fn()} />);
  await userEvent.click(screen.getByRole('combobox', { name: '体检结果筛选' }));
  await userEvent.click(screen.getByRole('option', { name: '重复' }));
  expect(screen.queryByRole('list', { name: '告警' })).not.toBeInTheDocument();
  expect(screen.getByText('该类别没有问题')).toBeInTheDocument();
});

test('没有配置时提示先载入，且不把缺失项计入总数', () => {
  render(<CheckupPanel groups={groups} hasContent={false} onJump={vi.fn()} onInsertMissing={vi.fn()} />);
  expect(screen.getByText('先在左侧载入或粘贴配置')).toBeInTheDocument();
  expect(screen.getByText('共 0 项')).toBeInTheDocument();
});

test('有配置且没有问题时的空状态', () => {
  render(<CheckupPanel groups={[]} hasContent onJump={vi.fn()} onInsertMissing={vi.fn()} />);
  expect(screen.getByText('当前配置没发现问题')).toBeInTheDocument();
});
