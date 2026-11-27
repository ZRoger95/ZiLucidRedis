import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { ScenarioChecklistItem, ScenarioFileView, ScenarioReviewGroup } from '../src/types';

import { FinishStep } from '../src/components/configurator/FinishStep';

const props = {
  line: '7.4',
  text: 'port 6380\nsave 900 1\n',
  changed: 2,
  hasSecret: false,
  ordinal: '29',
  onBack: vi.fn(),
  onDownload: vi.fn(),
  onHandoff: vi.fn(),
};

test('展示改动数与生成结果预览', () => {
  render(<FinishStep {...props} />);

  expect(screen.getByRole('heading', { name: '完成' })).toBeInTheDocument();
  expect(screen.getByText(/~\/configurator · 29 · 完成$/)).toBeInTheDocument();
  expect(screen.getByText('版本 7.4 · 共改 2 项 · 文件名 redis-7.4.conf')).toBeInTheDocument();
  expect(screen.getByLabelText('生成结果预览')).toHaveTextContent('port 6380');
});

test('说明区讲清预览文件的用法与占位符', () => {
  render(<FinishStep {...props} />);

  expect(screen.getByText(/落地检查/)).toBeInTheDocument();
  expect(screen.getByText(/redis-server redis-7\.4\.conf/)).toBeInTheDocument();
  expect(screen.getByText(/\${env_\*}/)).toBeInTheDocument();
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

const review: ScenarioReviewGroup[] = [
  {
    sectionId: 'MEMORY MANAGEMENT',
    items: [
      { name: 'maxmemory', reason: '显式内存上限', state: 'applied', value: '3gb' },
      { name: 'maxmemory-policy', reason: '淘汰策略', state: 'reset', value: null },
    ],
  },
  {
    sectionId: 'NETWORK',
    items: [{ name: 'bind', reason: '只监听所需网卡', state: 'modified', value: '10.0.0.5 127.0.0.1 -::1' }],
  },
];

const checklist: ScenarioChecklistItem[] = [
  { command: 'sudo sysctl vm.overcommit_memory=1', title: '允许内存过量提交', why: 'fork 需要过量提交' },
];

test('场景复查清单按区域分组并支持跳转', async () => {
  const onJumpSection = vi.fn();
  render(<FinishStep {...props} review={review} checklist={checklist} onJumpSection={onJumpSection} />);

  expect(screen.getByText('预设改了什么')).toBeInTheDocument();
  expect(screen.getByText('内存管理')).toBeInTheDocument();
  expect(screen.getByText('maxmemory')).toBeInTheDocument();
  expect(screen.getByText('显式内存上限')).toBeInTheDocument();
  expect(screen.getByText('已恢复官方默认')).toBeInTheDocument();
  expect(screen.getByText('已手动修改')).toBeInTheDocument();
  expect(screen.getByText('系统层必做项')).toBeInTheDocument();
  expect(screen.getByText('sudo sysctl vm.overcommit_memory=1')).toBeInTheDocument();

  await userEvent.click(screen.getAllByRole('button', { name: '去修改' })[0]);
  expect(onJumpSection).toHaveBeenCalledWith('MEMORY MANAGEMENT');
});

test('passwordMissing 显示无认证警告', () => {
  render(<FinishStep {...props} passwordMissing />);
  expect(screen.getByText('密码未填，当前配置将无认证')).toBeInTheDocument();
});

test('不传场景 props 时不渲染复查清单', () => {
  render(<FinishStep {...props} />);
  expect(screen.queryByText('预设改了什么')).toBeNull();
  expect(screen.queryByText('系统层必做项')).toBeNull();
});

const multiFiles: ScenarioFileView[] = [
  { role: 'master', title: '主库', fileName: 'redis-master-6379.conf', text: 'port 6379\n' },
  {
    role: 'replica1',
    title: '从库 1',
    fileName: 'redis-replica1-6380.conf',
    text: 'port 6380\nreplicaof 10.0.0.5 6379\n',
  },
  {
    role: 'replica2',
    title: '从库 2',
    fileName: 'redis-replica2-6381.conf',
    text: 'port 6381\nreplicaof 10.0.0.5 6379\n',
  },
  {
    role: 'sentinel1',
    title: '哨兵 1',
    fileName: 'sentinel1-26379.conf',
    text: 'port 26379\nsentinel monitor mymaster 10.0.0.5 6379 2\n',
  },
  {
    role: 'sentinel2',
    title: '哨兵 2',
    fileName: 'sentinel2-26380.conf',
    text: 'port 26380\nsentinel monitor mymaster 10.0.0.5 6379 2\n',
  },
  {
    role: 'sentinel3',
    title: '哨兵 3',
    fileName: 'sentinel3-26381.conf',
    text: 'port 26381\nsentinel monitor mymaster 10.0.0.5 6379 2\n',
  },
];

test('多文件场景渲染六个标签并按标签切换预览', async () => {
  render(<FinishStep {...props} files={multiFiles} />);

  const tabs = screen.getAllByRole('tab');
  expect(tabs).toHaveLength(6);
  expect(screen.getByLabelText('生成结果预览')).toHaveTextContent('port 6379');

  await userEvent.click(screen.getByRole('tab', { name: '从库 1' }));
  expect(screen.getByLabelText('生成结果预览')).toHaveTextContent('replicaof 10.0.0.5 6379');
  expect(screen.getByText(/文件名 redis-replica1-6380\.conf/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('tab', { name: '哨兵 1' }));
  expect(screen.getByLabelText('生成结果预览')).toHaveTextContent('sentinel monitor mymaster 10.0.0.5 6379 2');
});

test('多文件场景下载传当前文件且隐藏带回体检页', async () => {
  const onDownload = vi.fn();
  render(<FinishStep {...props} files={multiFiles} onDownload={onDownload} />);

  await userEvent.click(screen.getByRole('tab', { name: '从库 1' }));
  await userEvent.click(screen.getByRole('button', { name: '下载 conf' }));

  expect(onDownload).toHaveBeenCalledWith(multiFiles[1]);
  expect(screen.queryByRole('button', { name: '带回体检页' })).toBeNull();
});
