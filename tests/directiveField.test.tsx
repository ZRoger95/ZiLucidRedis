import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { DirectiveDoc } from '../src/types';

import { DirectiveField } from '../src/components/configurator/DirectiveField';
import { TooltipProvider } from '../src/components/ui/tooltip';

const LONG_COMMENT = [
  'By default, outgoing connections (from replica to master, from Sentinel to',
  'instances, cluster bus, etc.) are not bound to a specific local address. In',
  'most cases, this means the operating system will handle that based on routing',
  'and the interface through which the connection goes out.',
  '',
  'Example:',
];

function doc(name: string, comment: string[]): DirectiveDoc {
  return {
    name,
    section: 'NETWORK',
    type: 'string',
    defaultValue: '',
    defaultSource: 'conf-comment',
    range: null,
    sensitive: false,
    modifiable: true,
    comment,
  };
}

function renderField(name: string, comment: string[]) {
  return render(
    <TooltipProvider delayDuration={0}>
      <DirectiveField doc={doc(name, comment)} value={undefined} changed={false} onChange={vi.fn()} />
    </TooltipProvider>,
  );
}

test('未登记指令的过长英文说明两行钳制，hover 浮出完整信息', async () => {
  renderField('unregistered-future-directive', LONG_COMMENT);

  const clamp = screen.getByText(/By default, outgoing connections/);
  expect(clamp.className).toContain('line-clamp-2');
  expect(clamp.textContent).not.toContain('Example:');

  await userEvent.hover(clamp);
  const tip = await screen.findByRole('tooltip');
  expect(tip.textContent).toContain('and the interface through which the connection goes out.');
});

test('未登记指令的短说明不钳制也不挂 tooltip', async () => {
  renderField('unregistered-future-directive', ['Short note.']);

  const note = screen.getByText('Short note.');
  expect(note.className).not.toContain('line-clamp-2');

  await userEvent.hover(note);
  expect(screen.queryByRole('tooltip')).toBeNull();
});

test('已登记指令优先展示中文摘要而非英文注释', () => {
  renderField('bind-source-addr', LONG_COMMENT);

  expect(screen.getByText(/出站连接/)).toBeInTheDocument();
  expect(screen.queryByText(/By default, outgoing connections/)).toBeNull();
});

test('origin 标记来自场景与已手动修改，不传则不显示', () => {
  const field = (origin?: 'scenario' | 'modified') => (
    <TooltipProvider delayDuration={0}>
      <DirectiveField doc={doc('maxmemory', [])} value="3gb" changed onChange={vi.fn()} origin={origin} />
    </TooltipProvider>
  );
  const { rerender } = render(field('scenario'));
  expect(screen.getByText('来自场景')).toBeInTheDocument();

  rerender(field('modified'));
  expect(screen.getByText('已手动修改')).toBeInTheDocument();
  expect(screen.queryByText('来自场景')).toBeNull();

  rerender(field(undefined));
  expect(screen.queryByText('来自场景')).toBeNull();
  expect(screen.queryByText('已手动修改')).toBeNull();
});
