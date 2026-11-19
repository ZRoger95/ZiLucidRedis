import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

import type { ConfiguratorDraft, FreeLineKind } from '../src/types';

import { FreeLinesEditor } from '../src/components/configurator/FreeLinesEditor';
import { emptyDraft } from '../src/lib/configurator';

function Harness({ kind, initial }: { kind: FreeLineKind; initial: ConfiguratorDraft }) {
  const [draft, setDraft] = useState(initial);
  return <FreeLinesEditor kind={kind} draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />;
}

test('include 可以逐行添加，通配符原样保留', async () => {
  render(<Harness kind="include" initial={emptyDraft('7.4')} />);

  await userEvent.click(screen.getByRole('button', { name: '添加一行' }));
  await userEvent.type(screen.getByLabelText('路径 1'), '/etc/redis/*.conf');

  expect(screen.getByLabelText('路径 1')).toHaveValue('/etc/redis/*.conf');
});

test('删除一行只影响该行', async () => {
  const onChange = vi.fn();
  render(
    <FreeLinesEditor
      kind="loadmodule"
      draft={{ ...emptyDraft('7.4'), loadmodule: ['/a.so', '/b.so'] }}
      onChange={onChange}
    />,
  );

  await userEvent.click(screen.getAllByRole('button', { name: '删除' })[0]);
  expect(onChange).toHaveBeenCalledWith({ loadmodule: ['/b.so'] });
});

test('ACL 用户规则按行编辑', async () => {
  render(<Harness kind="user" initial={{ ...emptyDraft('7.4'), user: ['user alice on >secret ~* +@all'] }} />);

  const textarea = screen.getByLabelText('ACL 用户规则');
  expect(textarea).toHaveValue('user alice on >secret ~* +@all');

  await userEvent.type(textarea, '\nuser bob on ~jobs:* +@list');
  expect(textarea).toHaveValue('user alice on >secret ~* +@all\nuser bob on ~jobs:* +@list');
});

test('rename-command 分命令与新名两个输入', async () => {
  render(
    <Harness
      kind="renameCommand"
      initial={{ ...emptyDraft('7.4'), renameCommand: [{ command: 'CONFIG', target: '' }] }}
    />,
  );

  expect(screen.getByLabelText('命令 1')).toHaveValue('CONFIG');
  expect(screen.getByLabelText('新名 1')).toHaveValue('');

  await userEvent.type(screen.getByLabelText('新名 1'), 'b840');
  expect(screen.getByLabelText('新名 1')).toHaveValue('b840');
});
