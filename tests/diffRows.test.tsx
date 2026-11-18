import { createEvent, fireEvent, render } from '@testing-library/react';
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

function renderRows(rows: DiffRow[], onJump = vi.fn(), onEscape = vi.fn(), onApplyDefault = vi.fn()) {
  const model: DiffModel = { rows, counts, total: rows.length };
  const utils = render(
    <DiffView
      model={model}
      warnings={[]}
      onlyDiff
      onJump={onJump}
      onApplyDefault={onApplyDefault}
      onEscape={onEscape}
    />,
  );
  return { ...utils, onJump, onEscape, onApplyDefault };
}

const rowElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-slot="diff-row"]'));

test('整个行组只有一个 tab stop', () => {
  const { container } = renderRows([makeRow(10), makeRow(20)]);
  const rows = rowElements(container);
  expect(rows[0]).toHaveAttribute('tabindex', '0');
  expect(rows[1]).toHaveAttribute('tabindex', '-1');
});

test('方向键与 Home/End 移动焦点', async () => {
  const { container } = renderRows([makeRow(10), makeRow(20), makeRow(30)]);
  const rows = rowElements(container);

  rows[0].focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(rows[1]).toHaveFocus();

  await userEvent.keyboard('{End}');
  expect(rows[2]).toHaveFocus();

  await userEvent.keyboard('{Home}');
  expect(rows[0]).toHaveFocus();
});

test('Enter 跳转且阻止默认行为', async () => {
  const { container, onJump } = renderRows([makeRow(10), makeRow(20)]);
  const row = rowElements(container)[1];
  const event = createEvent.keyDown(row, { key: 'Enter' });
  fireEvent(row, event);
  expect(event.defaultPrevented).toBe(true);
  expect(onJump).toHaveBeenCalledWith(20);

  row.focus();
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
      warnings={[]}
      onlyDiff
      onJump={onJump}
      onRowActivate={onRowActivate}
      onApplyDefault={vi.fn()}
    />,
  );
  const rows = rowElements(container);
  rows[1].focus();
  await userEvent.keyboard('{Enter}');
  expect(onRowActivate).toHaveBeenCalledWith(20);
  expect(onJump).not.toHaveBeenCalled();
  expect(rows[1]).toHaveFocus();
});

test('Esc 请求回到编辑器', async () => {
  const { container, onEscape } = renderRows([makeRow(10)]);
  rowElements(container)[0].focus();
  await userEvent.keyboard('{Escape}');
  expect(onEscape).toHaveBeenCalledTimes(1);
});

test('没有左侧行号的行被方向键跳过', async () => {
  const added = makeRow(0, {
    key: 'added',
    kind: 'added',
    left: undefined,
    canApplyDefault: false,
    applyValue: null,
  });
  const { container } = renderRows([makeRow(10), added, makeRow(30)]);
  const rows = rowElements(container);

  rows[0].focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(rows[2]).toHaveFocus();
});

test('行内改回默认值按钮不触发行跳转', async () => {
  const { container, onJump, onApplyDefault } = renderRows([makeRow(10)]);
  const arrow = container.querySelector<HTMLButtonElement>('button[aria-label*="改回官方默认值"]');
  expect(arrow).not.toBeNull();
  arrow!.focus();
  await userEvent.keyboard('{Enter}');
  expect(onApplyDefault).toHaveBeenCalled();
  expect(onJump).not.toHaveBeenCalled();
});
