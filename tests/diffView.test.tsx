import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { DiffView } from '../src/components/DiffView';
import type { DiffModel, DiffRow } from '../src/lib/diff';

const row = (overrides: Partial<DiffRow> = {}): DiffRow => ({
  key: 'k',
  kind: 'changed',
  name: 'maxmemory',
  canonicalName: 'maxmemory',
  left: { lines: [{ lineNo: 154, segments: [{ text: 'maxmemory 0', changed: false }] }] },
  right: { lines: [{ lineNo: 1, segments: [{ text: 'maxmemory 8gb', changed: false }] }] },
  status: 'changed',
  risks: [],
  canApplyDefault: true,
  applyValue: '8gb',
  ...overrides,
});

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

const model = (rows: DiffRow[]): DiffModel => ({ rows, counts, total: rows.length });

test('renders both line numbers and applies default from the arrow', async () => {
  const onApplyDefault = vi.fn();
  render(
    <DiffView
      model={model([row()])}
      warnings={[]}
      onlyDiff={false}
      onJump={vi.fn()}
      onApplyDefault={onApplyDefault}
    />,
  );

  expect(screen.getByText('154')).toBeInTheDocument();
  expect(screen.getByText('1')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '将 maxmemory 改回官方默认值' }));
  expect(onApplyDefault).toHaveBeenCalledWith(154, '8gb');
});

test('jumps to the clicked left line number', async () => {
  const onJump = vi.fn();
  render(
    <DiffView model={model([row()])} warnings={[]} onlyDiff={false} onJump={onJump} onApplyDefault={vi.fn()} />,
  );

  await userEvent.click(screen.getByText('maxmemory 0'));
  expect(onJump).toHaveBeenCalledWith(154);
});

test('collapses long unchanged runs and expands on click', async () => {
  const unchanged = Array.from({ length: 3 }, (_, index) =>
    row({ key: `d${index}`, kind: 'default', canApplyDefault: false, applyValue: null }),
  );

  render(
    <DiffView
      model={model(unchanged)}
      warnings={[]}
      onlyDiff={false}
      onJump={vi.fn()}
      onApplyDefault={vi.fn()}
    />,
  );

  expect(screen.getByText('@@ 展开 3 行未修改 @@')).toBeInTheDocument();
});
