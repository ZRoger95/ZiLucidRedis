import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';

import { ConfiguratorPage } from '../src/components/configurator/ConfiguratorPage';
import { clearPendingConf, peekPendingConf, setPendingLine } from '../src/lib/handoff';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  localStorage.clear();
  clearPendingConf();
  Object.defineProperty(URL, 'createObjectURL', { value: originalCreateObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: originalRevokeObjectURL, configurable: true });
});

async function nextTimes(times: number): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  }
}

async function goToFinish(): Promise<void> {
  let guard = 0;
  while (!(screen.getByRole('button', { name: '下一步' }) as HTMLButtonElement).disabled && guard < 40) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }));
    guard += 1;
  }
}

async function switchVersion(label: RegExp): Promise<void> {
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  await userEvent.click(within(nav).getByRole('button', { name: /选择版本/ }));
  await userEvent.click(screen.getByLabelText('选择 Redis 版本'));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

test('向导加载后显示版本选择与区域导航', async () => {
  const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: '选择版本' })).toBeInTheDocument();
  expect(screen.getByText(/REDIS 版本线/)).toBeInTheDocument();
  expect(screen.getByText('切换版本会清空当前草稿。')).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  expect(within(nav).getByText('包含其他配置文件')).toBeInTheDocument();
  expect(within(nav).getByText('选择版本')).toBeInTheDocument();
  expect(within(nav).getByText('完成')).toBeInTheDocument();
  expect(scroll).toHaveBeenCalled();
  scroll.mockRestore();
});

test('下一步进入 INCLUDES 区域', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await userEvent.click(screen.getByRole('button', { name: '下一步' }));

  expect(screen.getByRole('heading', { name: '包含其他配置文件' })).toBeInTheDocument();
  expect(screen.getByText(/· INCLUDES$/)).toBeInTheDocument();
  expect(screen.getByText('在主配置靠前位置引入额外 conf；后加载的值会覆盖先前的')).toBeInTheDocument();
  expect(screen.getByText(/INCLUDE 示例/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'include 路径' })).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
});

test('所有步骤都用新骨架，不渲染右栏插图', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  let guard = 0;
  while (!(screen.getByRole('button', { name: '下一步' }) as HTMLButtonElement).disabled && guard < 40) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(container.querySelector('aside')).toBeNull();
    guard += 1;
  }

  expect(screen.getByRole('heading', { name: '完成' })).toBeInTheDocument();
  expect(guard).toBeLessThan(40);
});

test('ADVANCED CONFIG 步字段与说明栏并存', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(25);

  expect(screen.getByRole('heading', { name: '高级参数' })).toBeInTheDocument();
  expect(screen.getByText(/· ADVANCED CONFIG$/)).toBeInTheDocument();
  expect(screen.getByText(/调优示例/)).toBeInTheDocument();
  expect(screen.getByLabelText('hash-max-listpack-entries')).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
});

test('ACTIVE DEFRAGMENTATION 步字段与说明栏并存', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(26);

  expect(screen.getByRole('heading', { name: '主动碎片整理' })).toBeInTheDocument();
  expect(screen.getByText(/碎片整理示例/)).toBeInTheDocument();
  expect(screen.getByLabelText('activedefrag')).toBeInTheDocument();
});

test('其他步说明 config.c 有、官方模板未收录的指令', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(27);

  expect(screen.getByRole('heading', { name: '其他' })).toBeInTheDocument();
  expect(screen.getByText(/本区指令举例/)).toBeInTheDocument();
  expect(screen.getByText(/多为实验性或调试用途/)).toBeInTheDocument();
});

test('完成页展示序号、改动统计与落地检查', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await nextTimes(3);
  await userEvent.type(screen.getByLabelText('port'), '6380');
  await goToFinish();

  expect(screen.getByRole('heading', { name: '完成' })).toBeInTheDocument();
  expect(screen.getByText(/~\/configurator · 29 · 完成$/)).toBeInTheDocument();
  expect(screen.getByText('版本 7.4 · 共改 1 项 · 文件名 redis-7.4.conf')).toBeInTheDocument();
  expect(screen.getByText(/落地检查/)).toBeInTheDocument();
});

test('SECURITY 步展示示例注释与敏感字段、自由行', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(9);

  expect(screen.getByRole('heading', { name: '安全' })).toBeInTheDocument();
  expect(screen.getByText(/SECURITY 示例/)).toBeInTheDocument();
  expect(screen.getByLabelText('requirepass')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'ACL 用户规则' })).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
});

test('MEMORY MANAGEMENT 步字段与说明栏并存', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(11);

  expect(screen.getByRole('heading', { name: '内存管理' })).toBeInTheDocument();
  expect(screen.getByText(/内存示例/)).toBeInTheDocument();
  expect(screen.getByLabelText('maxmemory')).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
});

test('APPEND ONLY MODE 步字段与说明栏并存', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(16);

  expect(screen.getByRole('heading', { name: 'AOF 持久化' })).toBeInTheDocument();
  expect(screen.getByText(/AOF 示例/)).toBeInTheDocument();
  expect(screen.getByLabelText('appendfsync')).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
});

test('SLOW LOG 步字段与说明栏并存', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(21);

  expect(screen.getByRole('heading', { name: '慢日志' })).toBeInTheDocument();
  expect(screen.getByText(/慢日志示例/)).toBeInTheDocument();
  expect(screen.getByLabelText('slowlog-max-len')).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
});

test('TLS/SSL 步字段与说明栏并存', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(4);

  expect(screen.getByRole('heading', { name: '传输加密' })).toBeInTheDocument();
  expect(screen.getByText(/· TLS\/SSL$/)).toBeInTheDocument();
  expect(screen.getByText(/TLS 示例/)).toBeInTheDocument();
  expect(screen.getByLabelText('tls-port')).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
});

test('NETWORK 步字段与说明栏并存', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(3);

  expect(screen.getByRole('heading', { name: '网络' })).toBeInTheDocument();
  expect(screen.getByText(/· NETWORK$/)).toBeInTheDocument();
  expect(screen.getByText(/NETWORK 示例/)).toBeInTheDocument();
  expect(screen.getByLabelText('port')).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
});

test('MODULES 步展示示例注释与 loadmodule 编辑器', async () => {
  const { container } = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await nextTimes(2);

  expect(screen.getByRole('heading', { name: '模块加载' })).toBeInTheDocument();
  expect(screen.getByText(/· MODULES$/)).toBeInTheDocument();
  expect(screen.getByText(/LOADMODULE 示例/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'loadmodule 路径' })).toBeInTheDocument();
  expect(container.querySelector('aside')).toBeNull();
});

test('区域步展示可编辑字段', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  for (let index = 0; index < 3; index += 1) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  }

  expect(screen.getByRole('heading', { name: '网络' })).toBeInTheDocument();
  expect(screen.getByLabelText('port')).toHaveValue('');
});

test('编辑字段后导航与本页改动数同步', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  for (let index = 0; index < 3; index += 1) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  }

  await userEvent.type(screen.getByLabelText('port'), '6380');

  expect(screen.getByText('已改 1 项')).toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: '配置步骤' })).getByText('1')).toBeInTheDocument();
});

test('上一步在第一步禁用，最后一步不能继续', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  expect(screen.getByRole('button', { name: '上一步' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();
});

test('非敏感改动在重新挂载后恢复', async () => {
  const first = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await nextTimes(3);
  await userEvent.type(screen.getByLabelText('port'), '6380');
  first.unmount();

  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await nextTimes(3);

  expect(screen.getByLabelText('port')).toHaveValue('6380');
});

test('完成页可以带回编辑器', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await nextTimes(3);
  await userEvent.type(screen.getByLabelText('port'), '6380');

  await goToFinish();
  expect(screen.getByRole('heading', { name: '完成' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '带回体检页' }));

  const pending = peekPendingConf();
  expect(pending?.line).toBe('7.4');
  expect(pending?.text).toContain('port 6380');
});

test('完成页可以下载 conf', async () => {
  const createObjectURL = vi.fn(() => 'blob:x');
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await goToFinish();
  await userEvent.click(screen.getByRole('button', { name: '下载 conf' }));

  expect(createObjectURL).toHaveBeenCalledTimes(1);
  click.mockRestore();
});

test('进入向导时沿用体检页的版本', async () => {
  setPendingLine('8.2');
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );

  expect(await screen.findByText('当前版本 8.2')).toBeInTheDocument();
});

test('切换版本清空草稿并记住所选版本', async () => {
  const first = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await nextTimes(3);
  await userEvent.type(screen.getByLabelText('port'), '6380');
  expect(screen.getByText('已改 1 项')).toBeInTheDocument();

  await switchVersion(/^8\.2/);
  expect(screen.getByText('已改 0 项')).toBeInTheDocument();
  await nextTimes(3);
  expect(screen.getByLabelText('port')).toHaveValue('');
  first.unmount();

  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  expect(await screen.findByText('当前版本 8.2')).toBeInTheDocument();
  await nextTimes(3);
  expect(screen.getByLabelText('port')).toHaveValue('');
});

test('含明文密码时下载前需要确认', async () => {
  const createObjectURL = vi.fn(() => 'blob:x');
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  await userEvent.click(within(nav).getByRole('button', { name: /安全/ }));
  await userEvent.type(screen.getByLabelText('requirepass'), 'secret');

  await goToFinish();
  await userEvent.click(screen.getByRole('button', { name: '下载 conf' }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(createObjectURL).not.toHaveBeenCalled();

  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: '下载 conf' }));
  expect(createObjectURL).toHaveBeenCalledTimes(1);

  confirm.mockRestore();
  click.mockRestore();
});
