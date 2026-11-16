import { render, screen } from '@testing-library/react';
import { SummaryBar } from '../src/components/SummaryBar';

test('shows each count and the missing list', () => {
  render(
    <SummaryBar
      counts={{ changed: 3, unknown: 2, removed: 0, newer: 0, duplicate: 0 }}
      missing={['maxmemory']}
      warningCount={1}
      onJump={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: '已改 3' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '未知 2' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '缺失: maxmemory' })).toBeInTheDocument();
});
