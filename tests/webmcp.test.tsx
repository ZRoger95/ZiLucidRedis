import { act, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import type { DiffModel, DiffRow } from '../src/lib/diff';

import { agent, canAgentAct } from '../src/agent';
import { DiffRowItem, DiffRows } from '../src/components/diffRows';
import { DiffView } from '../src/components/DiffView';

const counts: DiffModel['counts'] = {
  changed: 1,
  default: 0,
  added: 0,
  removed: 0,
  newer: 0,
  unknown: 0,
  duplicate: 0,
  special: 0,
  'no-default': 0,
};

const secretRow: DiffRow = {
  key: 'row-12',
  kind: 'changed',
  name: 'requirepass',
  canonicalName: 'requirepass',
  left: { lines: [{ lineNo: 12, segments: [{ text: 'requirepass super-secret', changed: true }] }] },
  right: { lines: [{ lineNo: 12, segments: [{ text: 'requirepass default', changed: false }] }] },
  status: 'changed',
  risks: [],
  canApplyDefault: true,
  applyValue: 'default',
};

test('Agent 只能读取安全差异项并通过 activate 跳转', async () => {
  const onRowActivate = vi.fn();
  const model: DiffModel = { rows: [secretRow], counts, total: 1 };

  render(
    <DiffView
      model={model}
      onOnlyDiffChange={vi.fn()}
      onlyDiff
      onJump={vi.fn()}
      onRowActivate={onRowActivate}
      onApplyDefault={vi.fn()}
    />,
  );
  await act(async () => {});

  const snapshot = agent.snapshot().find((entry) => entry.component === 'diff-rows' && !entry.offPage);
  expect(snapshot).toMatchObject({ label: '配置对比行', actions: ['activate'] });
  expect(JSON.stringify(snapshot)).not.toContain('super-secret');

  const found = await agent.query({ within: '配置对比行', text: 'requirepass' });
  expect(found).toEqual([
    expect.objectContaining({
      label: '配置对比行',
      items: [{ value: 'row-12', label: 'requirepass' }],
    }),
  ]);
  expect(JSON.stringify(found)).not.toContain('super-secret');

  const result = await agent.act({
    steps: [{ ref: '配置对比行', action: 'activate', args: ['row-12'] }],
  });
  expect(result.ok).toBe(true);
  expect(onRowActivate).toHaveBeenCalledWith(12);
});

test('Agent 拒绝激活未暴露的差异项', async () => {
  const onActivate = vi.fn();
  render(
    <DiffRows agentItems={[{ value: 'row-12', label: 'requirepass' }]} onActivate={onActivate}>
      <DiffRowItem value="row-12" lineNo={12} label="第 12 行，requirepass" />
    </DiffRows>,
  );
  await act(async () => {});

  const result = await agent.act({
    steps: [{ ref: '配置对比行', action: 'activate', args: ['not-exposed'] }],
  });

  expect(result.steps[0]?.result).toBe(false);
  expect(onActivate).not.toHaveBeenCalled();
});

test('Agent 权限只允许 diff-rows 的 activate', () => {
  const step = { ref: 'c1', component: 'diff-rows', action: 'activate', args: ['row-12'] };

  expect(canAgentAct(step)).toBe(true);
  expect(canAgentAct({ ...step, action: 'press' })).toBe(false);
  expect(canAgentAct({ ...step, component: 'input', action: 'setValue' })).toBe(false);
});
