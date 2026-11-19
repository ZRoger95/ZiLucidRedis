import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { DirectiveDoc } from '../src/types';

import { DirectiveField } from '../src/components/configurator/DirectiveField';

const base: DirectiveDoc = {
  name: 'port',
  section: 'NETWORK',
  type: 'int',
  defaultValue: '6379',
  defaultSource: 'config.c',
  range: '0..65535',
  sensitive: false,
  modifiable: true,
  comment: ['Accept connections on the specified port'],
};

test('bool 用开关，切换写成 yes/no', async () => {
  const onChange = vi.fn();
  render(
    <DirectiveField
      doc={{ ...base, name: 'protected-mode', type: 'bool', defaultValue: 'yes', range: null }}
      value={undefined}
      changed={false}
      onChange={onChange}
    />,
  );

  expect(screen.getByRole('switch', { name: 'protected-mode' })).toBeChecked();

  await userEvent.click(screen.getByRole('switch', { name: 'protected-mode' }));
  expect(onChange).toHaveBeenCalledWith('no');
});

test('enum 提供候选值，且允许自由输入', () => {
  const { container } = render(
    <DirectiveField
      doc={{ ...base, name: 'maxmemory-policy', type: 'enum', defaultValue: 'noeviction', range: null }}
      value={undefined}
      changed={false}
      onChange={vi.fn()}
    />,
  );

  const input = screen.getByLabelText('maxmemory-policy');
  expect(input).toHaveAttribute('list');
  expect(container.querySelector('datalist option[value="allkeys-lru"]')).not.toBeNull();
});

test('special 用多行文本域并保留换行', () => {
  render(
    <DirectiveField
      doc={{ ...base, name: 'save', type: 'special', defaultValue: '3600 1', range: null }}
      value={'900 1\n300 10'}
      changed
      onChange={vi.fn()}
    />,
  );

  const textarea = screen.getByLabelText('save');
  expect(textarea.tagName).toBe('TEXTAREA');
  expect(textarea).toHaveValue('900 1\n300 10');
});

test('敏感字段用密码框并提示不落盘', () => {
  render(
    <DirectiveField
      doc={{ ...base, name: 'requirepass', type: 'sds', defaultValue: '', range: null, sensitive: true }}
      value="secret"
      changed
      onChange={vi.fn()}
    />,
  );

  expect(screen.getByLabelText('requirepass')).toHaveAttribute('type', 'password');
  expect(screen.getByText(/敏感值不保存/)).toBeInTheDocument();
});

test('可直接恢复默认，清空输入视作恢复默认', async () => {
  const onChange = vi.fn();
  render(<DirectiveField doc={base} value="6380" changed onChange={onChange} />);

  await userEvent.click(screen.getByRole('button', { name: /恢复默认/ }));
  expect(onChange).toHaveBeenCalledWith(null);

  await userEvent.clear(screen.getByLabelText('port'));
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test('展示默认值、范围与需重启提示', () => {
  render(
    <DirectiveField
      doc={{ ...base, name: 'bind', type: 'special', defaultValue: null, range: null, modifiable: false }}
      value={undefined}
      changed={false}
      onChange={vi.fn()}
    />,
  );

  expect(screen.getByText('默认 —')).toBeInTheDocument();
  expect(screen.getByText('需重启生效')).toBeInTheDocument();
});
