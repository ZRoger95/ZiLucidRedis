import { act, createEvent, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { DiffModel, DiffRow } from '../src/lib/diff';

import { DiffView } from '../src/components/DiffView';

const counts: DiffModel['counts'] = {
  changed: 3,
  default: 0,
  added: 1,
  removed: 0,
  newer: 0,
  unknown: 0,
  duplicate: 0,
  special: 0,
  'no-default': 0,
};

function makeRow(lineNo: number, overrides: Partial<DiffRow> = {}): DiffRow {
  return {
    key: `row-${lineNo}`,
    kind: 'changed',
    name: `directive-${lineNo}`,
    canonicalName: `directive-${lineNo}`,
    left: { lines: [{ lineNo, segments: [{ text: `directive-${lineNo} 1`, changed: false }] }] },
    right: { lines: [{ lineNo, segments: [{ text: `directive-${lineNo} 2`, changed: false }] }] },
    status: 'changed',
    risks: [],
    canApplyDefault: true,
    applyValue: '2',
    ...overrides,
  };
}

async function renderRows(rows: DiffRow[], onJump = vi.fn(), onEscape = vi.fn(), onApplyDefault = vi.fn()) {
  const model: DiffModel = { rows, counts, total: rows.length };
  const utils = render(
    <DiffView
      model={model}
      onOnlyDiffChange={vi.fn()}
      onlyDiff
      onJump={onJump}
      onApplyDefault={onApplyDefault}
      onEscape={onEscape}
    />,
  );
  // roving 组通过微任务同步 tabindex，先让这些更新落在 act 内
  await act(async () => {});
  return { ...utils, onJump, onEscape, onApplyDefault };
}

async function focusRow(row: HTMLElement) {
  await act(async () => {
    row.focus();
  });
}

const rowElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-slot="diff-row"]'));

test('整个行组只有一个 tab stop', async () => {
  const { container } = await renderRows([makeRow(10), makeRow(20)]);
  const rows = rowElements(container);
  expect(rows[0]).toHaveAttribute('tabindex', '0');
  expect(rows[1]).toHaveAttribute('tabindex', '-1');
});

test('方向键与 Home/End 移动焦点并迁移 tabindex', async () => {
  const { container } = await renderRows([makeRow(10), makeRow(20), makeRow(30)]);
  const rows = rowElements(container);

  await focusRow(rows[0]);
  await userEvent.keyboard('{ArrowDown}');
  expect(rows[1]).toHaveFocus();
  expect(rows[0]).toHaveAttribute('tabindex', '-1');
  expect(rows[1]).toHaveAttribute('tabindex', '0');

  await userEvent.keyboard('{ArrowDown}');
  expect(rows[2]).toHaveFocus();

  await userEvent.keyboard('{ArrowUp}');
  expect(rows[1]).toHaveFocus();

  await userEvent.keyboard('{End}');
  expect(rows[2]).toHaveFocus();
  expect(rows[2]).toHaveAttribute('tabindex', '0');

  await userEvent.keyboard('{Home}');
  expect(rows[0]).toHaveFocus();
});

test('Enter 跳转且阻止默认行为', async () => {
  const { container, onJump } = await renderRows([makeRow(10), makeRow(20)]);
  const row = rowElements(container)[1];
  const event = createEvent.keyDown(row, { key: 'Enter' });
  fireEvent(row, event);
  expect(event.defaultPrevented).toBe(true);
  expect(onJump).toHaveBeenCalledWith(20);

  await focusRow(row);
  await userEvent.keyboard('{Enter}');
  expect(onJump).toHaveBeenCalledTimes(2);
});

test('Enter 走行激活回调时焦点留在行上', async () => {
  const onJump = vi.fn();
  const onRowActivate = vi.fn();
  const model: DiffModel = { rows: [makeRow(10), makeRow(20)], counts, total: 2 };
  const { container } = render(
    <DiffView
      model={model}
      onOnlyDiffChange={vi.fn()}
      onlyDiff
      onJump={onJump}
      onRowActivate={onRowActivate}
      onApplyDefault={vi.fn()}
    />,
  );
  await act(async () => {});
  const rows = rowElements(container);
  await focusRow(rows[1]);
  await userEvent.keyboard('{Enter}');
  expect(onRowActivate).toHaveBeenCalledWith(20);
  expect(onJump).not.toHaveBeenCalled();
  expect(rows[1]).toHaveFocus();
});

test('Esc 请求回到编辑器', async () => {
  const { container, onEscape } = await renderRows([makeRow(10)]);
  await focusRow(rowElements(container)[0]);
  await userEvent.keyboard('{Escape}');
  expect(onEscape).toHaveBeenCalledTimes(1);
});

test('焦点在行内改回默认值按钮上时 Esc 也回到编辑器', async () => {
  const { container, onEscape, onApplyDefault } = await renderRows([makeRow(10)]);
  const arrow = container.querySelector<HTMLButtonElement>('button[aria-label*="改回官方默认值"]');
  expect(arrow).not.toBeNull();
  await focusRow(arrow!);
  await userEvent.keyboard('{Escape}');
  expect(onEscape).toHaveBeenCalledTimes(1);
  expect(onApplyDefault).not.toHaveBeenCalled();
});

test('没有左侧行号的行被方向键跳过', async () => {
  const added = makeRow(0, {
    key: 'added',
    kind: 'added',
    left: undefined,
    canApplyDefault: false,
    applyValue: null,
  });
  const { container } = await renderRows([makeRow(10), added, makeRow(30)]);
  const rows = rowElements(container);

  await focusRow(rows[0]);
  await userEvent.keyboard('{ArrowDown}');
  expect(rows[2]).toHaveFocus();
});

test('首行为 added 时停靠点落在第一个可聚焦行', async () => {
  const added = makeRow(0, {
    key: 'added-first',
    kind: 'added',
    left: undefined,
    canApplyDefault: false,
    applyValue: null,
  });
  const { container } = await renderRows([added, makeRow(10)]);
  const rows = rowElements(container);

  expect(rows[0]).toHaveAttribute('tabindex', '-1');
  expect(rows[1]).toHaveAttribute('tabindex', '0');
});

test('行内改回默认值按钮不触发行跳转', async () => {
  const { container, onJump, onApplyDefault } = await renderRows([makeRow(10)]);
  const arrow = container.querySelector<HTMLButtonElement>('button[aria-label*="改回官方默认值"]');
  expect(arrow).not.toBeNull();
  await focusRow(arrow!);
  await userEvent.keyboard('{Enter}');
  expect(onApplyDefault).toHaveBeenCalled();
  expect(onJump).not.toHaveBeenCalled();
});
