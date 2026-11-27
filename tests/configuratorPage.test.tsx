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

async function startScenario(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: '单机单实例' }));
}

async function dedicatedMixedToFinish(): Promise<void> {
  await startScenario();
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '2 核 4G' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '混用 RDB + AOF' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));
}

test('场景入口与问卷导航', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  expect(screen.getByRole('button', { name: '逐项配置' })).toBeInTheDocument();

  await startScenario();

  expect(screen.getByRole('heading', { name: '部署画像' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  for (const name of ['02部署画像', '03资源', '04持久化', '05访问面']) {
    expect(within(nav).getByRole('button', { name })).toBeInTheDocument();
  }
  expect(screen.getByText('重新回答会覆盖预设项的修改')).toBeInTheDocument();
});

test('选项整卡在同一个 label 内，点击描述也能选中', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await startScenario();

  const summary = screen.getByText('机器上还有别的服务，需要给出 Redis 的内存预算');
  const card = summary.closest('label');
  expect(card).not.toBeNull();
  expect(card).toContainElement(screen.getByRole('radio', { name: '与其他服务混部' }));

  await userEvent.click(summary);
  expect(screen.getByRole('radio', { name: '与其他服务混部' })).toHaveAttribute('aria-checked', 'true');
});

test('独占混用路径直达完成页并写入预设', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await dedicatedMixedToFinish();

  expect(screen.getByRole('heading', { name: '完成' })).toBeInTheDocument();
  const preview = screen.getByLabelText('生成结果预览').textContent ?? '';
  expect(preview).toContain('maxmemory 3gb');
  expect(preview).toContain('appendonly yes');
  expect(preview).toContain('bind 127.0.0.1 -::1');
});

test('混部预算落到 maxmemory', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await startScenario();
  await userEvent.click(screen.getByRole('radio', { name: '与其他服务混部' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.type(screen.getByLabelText('内存预算'), '2');
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));

  const preview = screen.getByLabelText('生成结果预览').textContent ?? '';
  expect(preview).toContain('maxmemory 1536mb');
});

test('混部预算接受 GB 小数并落到 maxmemory', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await startScenario();
  await userEvent.click(screen.getByRole('radio', { name: '与其他服务混部' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  const budget = screen.getByLabelText('内存预算');
  await userEvent.type(budget, '3.5');
  expect(budget).toHaveValue('3.5');
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));

  const preview = screen.getByLabelText('生成结果预览').textContent ?? '';
  expect(preview).toContain('maxmemory 2688mb');
});

test('混部预算拒绝尾随垃圾并提示', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await startScenario();
  await userEvent.click(screen.getByRole('radio', { name: '与其他服务混部' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  const budget = screen.getByLabelText('内存预算');
  await userEvent.type(budget, '2abc');
  expect(budget).toHaveValue('2abc');
  expect(screen.getByText(/请输入数字/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();

  await userEvent.clear(budget);
  expect(screen.queryByText(/请输入数字/)).toBeNull();
  await userEvent.type(budget, '2.5');
  expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();
});

test('内网访问必填 IP 与密码才能生成', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await startScenario();
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '2 核 4G' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '内网访问' }));
  expect(screen.getByRole('button', { name: '生成配置' })).toBeDisabled();

  await userEvent.type(screen.getByLabelText('内网 IP'), '10.0.0.5');
  expect(screen.getByRole('button', { name: '生成配置' })).toBeDisabled();

  await userEvent.type(screen.getByLabelText('连接密码'), 's3cret');
  expect(screen.getByRole('button', { name: '生成配置' })).toBeEnabled();

  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));
  const preview = screen.getByLabelText('生成结果预览').textContent ?? '';
  expect(preview).toContain('requirepass s3cret');
  expect(preview).toContain('bind 10.0.0.5 127.0.0.1 -::1');
});

test('重答问卷覆盖预设项', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await dedicatedMixedToFinish();

  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  await userEvent.click(within(nav).getByRole('button', { name: '04持久化' }));
  await userEvent.click(screen.getByRole('radio', { name: '不开持久化' }));
  await userEvent.click(within(nav).getByRole('button', { name: '05访问面' }));
  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));

  const preview = screen.getByLabelText('生成结果预览').textContent ?? '';
  expect(preview).toContain('appendonly no');
  expect(preview).toContain('save ""');
  expect(preview).toContain('maxmemory-policy allkeys-lru');
});

test('已有场景草稿时入口显示继续', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await dedicatedMixedToFinish();

  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  await userEvent.click(within(nav).getByRole('button', { name: '01选择版本' }));
  expect(screen.getByRole('button', { name: '继续场景问卷' })).toBeInTheDocument();
});

test('刷新后密码丢失完成页警告且下载确认追加提示', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const first = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await startScenario();
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '2 核 4G' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '内网访问' }));
  await userEvent.type(screen.getByLabelText('内网 IP'), '10.0.0.5');
  await userEvent.type(screen.getByLabelText('连接密码'), 's3cret');
  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));
  first.unmount();

  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  await userEvent.click(within(nav).getByRole('button', { name: /完成/ }));

  expect(screen.getByText('密码未填，当前配置将无认证')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '下载 conf' }));
  expect(confirm).toHaveBeenCalled();
  expect(String(confirm.mock.calls[0][0])).toContain('密码未填');
  confirm.mockRestore();
});

test('集群刷新后密码丢失完成页警告且下载确认追加提示', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const first = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await startClusterScenario();
  await userEvent.click(screen.getByRole('radio', { name: '与其他服务混部' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.type(screen.getByLabelText('内存预算'), '2');
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '混用 RDB + AOF' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.type(screen.getByLabelText('节点内网 IP'), '10.0.0.5');
  await userEvent.type(screen.getByLabelText('连接密码'), 's3cret');
  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));
  expect(screen.getAllByRole('tab')).toHaveLength(6);
  first.unmount();

  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  await userEvent.click(within(nav).getByRole('button', { name: /完成/ }));

  expect(screen.getAllByRole('tab')).toHaveLength(6);
  expect(screen.getByText('密码未填，当前配置将无认证')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '下载 conf' }));
  expect(confirm).toHaveBeenCalled();
  expect(String(confirm.mock.calls[0][0])).toContain('密码未填');
  confirm.mockRestore();
});

test('哨兵刷新后密码丢失完成页警告且下载确认追加提示', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const first = render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  await startReplScenario();
  await userEvent.click(screen.getByRole('radio', { name: '与其他服务混部' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.type(screen.getByLabelText('内存预算'), '2');
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '混用 RDB + AOF' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.type(screen.getByLabelText('主库地址'), '10.0.0.5');
  await userEvent.type(screen.getByLabelText('连接密码'), 's3cret');
  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));
  expect(screen.getAllByRole('tab')).toHaveLength(6);
  first.unmount();

  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  await userEvent.click(within(nav).getByRole('button', { name: /完成/ }));

  expect(screen.getByText('密码未填，当前配置将无认证')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '下载 conf' }));
  expect(confirm).toHaveBeenCalled();
  expect(String(confirm.mock.calls[0][0])).toContain('密码未填');
  confirm.mockRestore();
});

async function startReplScenario(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: '一主二从三哨兵' }));
}

async function startClusterScenario(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: '三主三从集群' }));
}

async function clusterToNetwork(): Promise<void> {
  await startClusterScenario();
  await userEvent.click(screen.getByRole('radio', { name: '与其他服务混部' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.type(screen.getByLabelText('内存预算'), '2');
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '混用 RDB + AOF' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
}

test('三个场景入口与 cluster 三步问卷导航', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  expect(screen.getByRole('button', { name: '单机单实例' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '一主二从三哨兵' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '三主三从集群' })).toBeInTheDocument();

  await startClusterScenario();

  expect(screen.getByRole('heading', { name: '资源' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  expect(within(nav).getByRole('button', { name: /02资源/ })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: /03持久化/ })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: /04网络与认证/ })).toBeInTheDocument();
});

test('cluster 节点地址与密码为空时不能生成', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await clusterToNetwork();

  expect(screen.getByRole('button', { name: '生成配置' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('节点内网 IP'), '10.0.0.5');
  expect(screen.getByRole('button', { name: '生成配置' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('连接密码'), 's3cret');
  expect(screen.getByRole('button', { name: '生成配置' })).toBeEnabled();
});

test('cluster 三步问卷直达完成页并生成六份文件', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await clusterToNetwork();
  await userEvent.type(screen.getByLabelText('节点内网 IP'), '10.0.0.5');
  await userEvent.type(screen.getByLabelText('连接密码'), 's3cret');
  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));

  expect(screen.getByRole('heading', { name: '完成' })).toBeInTheDocument();
  expect(screen.getAllByRole('tab')).toHaveLength(6);

  const master = screen.getByLabelText('生成结果预览').textContent ?? '';
  expect(master).toContain('port 7000');
  expect(master).toContain('cluster-enabled yes');
  expect(master).toContain('cluster-require-full-coverage no');
  expect(master).toContain('dir /var/lib/redis/7000');
  expect(master).toContain('cluster-config-file nodes-7000.conf');
  expect(master).toContain('bind 10.0.0.5 127.0.0.1 -::1');
  expect(master).toContain('requirepass s3cret');
  expect(master).toContain('masterauth s3cret');
  expect(master).not.toMatch(/^replicaof /m);

  await userEvent.click(screen.getByRole('tab', { name: '从库 3' }));
  const replica = screen.getByLabelText('生成结果预览').textContent ?? '';
  expect(replica).toContain('port 7005');
  expect(replica).toContain('cluster-config-file nodes-7005.conf');
  expect(replica).not.toMatch(/^replicaof /m);

  expect(screen.getByText('初始化集群：分配槽并建立主从')).toBeInTheDocument();
  expect(
    screen.getByText(/redis-cli -a 's3cret' --cluster create 10\.0\.0\.5:7000 .*10\.0\.0\.5:7005 --cluster-replicas 1/),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '带回体检页' })).not.toBeInTheDocument();
});

test('两个场景入口与 replica-sentinel 三步问卷导航', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });
  expect(screen.getByRole('button', { name: '单机单实例' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '一主二从三哨兵' })).toBeInTheDocument();

  await startReplScenario();

  expect(screen.getByRole('heading', { name: '资源' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: '配置步骤' });
  expect(within(nav).getByRole('button', { name: /02资源/ })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: /03持久化/ })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: /04网络/ })).toBeInTheDocument();
});

test('replica-sentinel 三步问卷直达完成页', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await startReplScenario();
  await userEvent.click(screen.getByRole('radio', { name: '与其他服务混部' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.type(screen.getByLabelText('内存预算'), '2');
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('radio', { name: '混用 RDB + AOF' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.type(screen.getByLabelText('主库地址'), '10.0.0.5');
  await userEvent.type(screen.getByLabelText('连接密码'), 's3cret');
  await userEvent.click(screen.getByRole('button', { name: '生成配置' }));

  expect(screen.getByRole('heading', { name: '完成' })).toBeInTheDocument();
  expect(screen.getAllByRole('tab')).toHaveLength(6);
  expect(screen.getByText('三哨兵跨机器部署')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('tab', { name: '从库 1' }));
  expect(screen.getByLabelText('生成结果预览')).toHaveTextContent('replicaof 10.0.0.5 6379');
  await userEvent.click(screen.getByRole('tab', { name: '哨兵 1' }));
  expect(screen.getByLabelText('生成结果预览')).toHaveTextContent('sentinel monitor mymaster 10.0.0.5 6379 2');
});

test('replica-sentinel 网络步必填主库地址与密码', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  await startReplScenario();
  await userEvent.click(screen.getByRole('radio', { name: '与其他服务混部' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.type(screen.getByLabelText('内存预算'), '2');
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));
  await userEvent.click(screen.getByRole('button', { name: '下一步' }));

  expect(screen.getByRole('button', { name: '生成配置' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('主库地址'), '10.0.0.5');
  expect(screen.getByRole('button', { name: '生成配置' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('连接密码'), 's3cret');
  expect(screen.getByRole('button', { name: '生成配置' })).toBeEnabled();
});
