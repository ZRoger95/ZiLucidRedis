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

test('asks for input when the left side is empty', () => {
  render(
    <DiffView
      model={model([])}
      warnings={[]}
      onlyDiff={false}
      hasContent={false}
      onJump={vi.fn()}
      onApplyDefault={vi.fn()}
    />,
  );

  expect(screen.getByText('先在左侧载入或粘贴配置')).toBeInTheDocument();
});

test('renders the row note', () => {
  render(
    <DiffView
      model={model([row({ note: '旧名：slaveof → replicaof' })])}
      warnings={[]}
      onlyDiff={false}
      onJump={vi.fn()}
      onApplyDefault={vi.fn()}
    />,
  );

  expect(screen.getByText('旧名：slaveof → replicaof')).toBeInTheDocument();
});

test('shows the official baseline version', () => {
  render(
    <DiffView
      model={model([row()])}
      warnings={[]}
      onlyDiff={false}
      baseline="7.4.12 · 2026-10-26"
      onJump={vi.fn()}
      onApplyDefault={vi.fn()}
    />,
  );

  expect(screen.getByText('官方默认 · 7.4.12 · 2026-10-26')).toBeInTheDocument();
});

test('jumps to the clicked line inside a multi line block', async () => {
  const onJump = vi.fn();
  const multi = row({
    key: 'multi',
    left: {
      lines: [
        { lineNo: 168, segments: [{ text: 'save 900 1', changed: false }] },
        { lineNo: 169, segments: [{ text: 'save 300 10', changed: false }] },
      ],
    },
    canApplyDefault: false,
    applyValue: null,
  });

  render(
    <DiffView model={model([multi])} warnings={[]} onlyDiff={false} onJump={onJump} onApplyDefault={vi.fn()} />,
  );

  await userEvent.click(screen.getByText('save 300 10'));
  expect(onJump).toHaveBeenCalledWith(169);
});

test('expands the unchanged run after clicking the collapse row', async () => {
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

  await userEvent.click(screen.getByText('@@ 展开 3 行未修改 @@'));
  expect(screen.queryByText('@@ 展开 3 行未修改 @@')).not.toBeInTheDocument();
  expect(screen.getAllByText('maxmemory 0')).toHaveLength(3);
});

test('applies a quoted empty default through the arrow', async () => {
  const onApplyDefault = vi.fn();
  const emptyDefault = row({
    name: 'logfile',
    canonicalName: 'logfile',
    left: { lines: [{ lineNo: 5, segments: [{ text: 'logfile /var/log/redis.log', changed: false }] }] },
    right: { lines: [{ lineNo: 1, segments: [{ text: 'logfile ""', changed: false }] }] },
    applyValue: '""',
  });

  render(
    <DiffView
      model={model([emptyDefault])}
      warnings={[]}
      onlyDiff={false}
      onJump={vi.fn()}
      onApplyDefault={onApplyDefault}
    />,
  );

  await userEvent.click(screen.getByRole('button', { name: '将 logfile 改回官方默认值' }));
  expect(onApplyDefault).toHaveBeenCalledWith(5, '""');
});
