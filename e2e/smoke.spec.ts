import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ARTIFACTS = path.resolve(process.cwd(), '.screenshots/smoke');
const PLAINTEXT = 'SmokePass123';
const FIXTURE = `# smoke fixture\nport 6380\nmaxmemory 100mb\nrequirepass ${PLAINTEXT}\ntotally-unknown-directive hello\n`;

test.beforeAll(() => {
  mkdirSync(ARTIFACTS, { recursive: true });
});

test('核心链路：导入、密码不落盘、导出、视图、向导、持久化', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Redis 配置体检' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '贴一份 redis.conf 进来看体检结果' })).toBeVisible();

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'smoke.conf',
      mimeType: 'text/plain',
      buffer: Buffer.from(FIXTURE, 'utf8'),
    });

  await expect(page.getByText(/已把 1 处密码替换为/)).toBeVisible();
  const editorPane = page.getByRole('region', { name: '你的配置' });
  await expect(editorPane.getByText(/4 行 · 已改 \d+/)).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('${env_requirepass}');
  await expect(page.locator('.cm-content')).not.toContainText(PLAINTEXT);
  await expect(
    page.getByRole('region', { name: '体检结果' }).getByText('totally-unknown-directive').first(),
  ).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, '01-import.png'), fullPage: true });

  const stored = await page.evaluate(() => localStorage.getItem('zilucid:state') ?? '');
  expect(stored).toContain('${env_requirepass}');
  expect(stored).not.toContain(PLAINTEXT);

  const [originalDownload] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: '导出', exact: true }).click();
      await page.getByRole('menuitem', { name: '原样导出（密码保持占位符）' }).click();
    })(),
  ]);
  const originalPath = path.join(ARTIFACTS, 'export-original.conf');
  await originalDownload.saveAs(originalPath);
  const original = readFileSync(originalPath, 'utf8');
  expect(original).toContain('${env_requirepass}');
  expect(original).not.toContain(PLAINTEXT);

  const [secretDownload] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: '导出', exact: true }).click();
      await page.getByRole('menuitem', { name: '还原密码后导出…' }).click();
    })(),
  ]);
  expect(dialogs.some((message) => message.includes('明文密码'))).toBe(true);
  const secretPath = path.join(ARTIFACTS, 'export-secrets.conf');
  await secretDownload.saveAs(secretPath);
  expect(readFileSync(secretPath, 'utf8')).toContain(PLAINTEXT);

  await page.getByRole('tab', { name: '配置对比' }).click();
  await expect(page.getByRole('region', { name: '配置对比' })).toBeVisible();
  await expect(page.getByRole('switch', { name: '只看差异' })).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, '02-diff.png'), fullPage: true });

  await page.getByRole('tab', { name: '配置项说明' }).click();
  await expect(page.getByRole('tab', { name: '配置项说明' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: path.join(ARTIFACTS, '03-detail.png'), fullPage: true });

  await page.getByRole('button', { name: '生成配置' }).click();
  await expect(page).toHaveURL(/\/configurator$/);
  await expect(page.getByRole('heading', { name: '生成配置' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '选择 Redis 版本' })).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, '04-configurator.png'), fullPage: true });

  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('port 6380');
  await expect(page.locator('.cm-content')).not.toContainText(PLAINTEXT);
  await page.screenshot({ path: path.join(ARTIFACTS, '05-reload.png'), fullPage: true });
});

test('向导主链路：填写、自由行、下载、带回体检页', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  await page.goto('/');
  await page.getByRole('button', { name: '生成配置' }).click();
  await expect(page).toHaveURL(/\/configurator$/);
  await expect(page.getByRole('heading', { name: '生成配置' })).toBeVisible();

  await page.getByRole('combobox', { name: '选择 Redis 版本' }).click();
  await page.getByRole('option', { name: /^7\.4 ·/ }).click();
  await expect(page.getByText('当前版本 7.4')).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, '06-wizard-version.png'), fullPage: true });

  const nav = page.getByRole('navigation', { name: '配置步骤' });
  const currentStep = page.getByRole('region', { name: '当前步骤' });

  await nav.getByRole('button', { name: '网络' }).click();
  await page.getByLabel('port', { exact: true }).fill('6390');
  await expect(nav.getByRole('button', { name: '网络' }).locator('span').last()).toHaveText('1');
  await expect(page.getByText('已改 1 项')).toBeVisible();

  await nav.getByRole('button', { name: '快照持久化' }).click();
  await page.getByLabel('save', { exact: true }).fill('3600 1\n300 100');
  await expect(page.getByText('已改 2 项')).toBeVisible();

  await nav.getByRole('button', { name: '内存管理' }).click();
  await page.getByLabel('maxmemory-policy', { exact: true }).fill('allkeys-lru');
  await expect(page.getByText('已改 3 项')).toBeVisible();

  await nav.getByRole('button', { name: 'AOF 持久化' }).click();
  await page.getByRole('switch', { name: 'appendonly' }).click();
  await expect(page.getByText('已改 4 项')).toBeVisible();

  await nav.getByRole('button', { name: '安全' }).click();
  await page.getByLabel('requirepass', { exact: true }).fill(PLAINTEXT);
  await page.getByLabel('ACL 用户规则').fill(`user smoke on ~* +@all >${PLAINTEXT}`);
  await currentStep.getByRole('button', { name: '添加一行' }).click();
  await page.getByLabel('命令 1').fill('CONFIG');
  await page.getByLabel('新名 1').fill('smoke-config');
  await expect(nav.getByRole('button', { name: '安全' }).locator('span').last()).toHaveText('3');
  await expect(page.getByText('已改 7 项')).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, '07-wizard-security.png'), fullPage: true });

  await nav.getByRole('button', { name: '包含其他配置文件' }).click();
  await currentStep.getByRole('button', { name: '添加一行' }).click();
  await page.getByLabel('路径 1').fill('/etc/redis/smoke-*.conf');
  await expect(page.getByText('已改 8 项')).toBeVisible();

  await nav.getByRole('button', { name: '模块加载' }).click();
  await currentStep.getByRole('button', { name: '添加一行' }).click();
  await page.getByLabel('路径 1').fill('/opt/modules/smoke.so');
  await expect(page.getByText('已改 9 项')).toBeVisible();

  await nav.getByRole('button', { name: '完成' }).click();
  await expect(page.getByText('共改 9 项')).toBeVisible();
  const preview = page.locator('pre[aria-label="生成结果预览"]');
  await expect(preview).toBeVisible();
  const generated = (await preview.textContent()) ?? '';
  expect(generated).toContain('port 6390');
  expect(generated).toContain('appendonly yes');
  expect(generated).toContain('maxmemory-policy allkeys-lru');
  expect(generated).toContain('save 3600 1\nsave 300 100');
  expect(generated).toContain(`requirepass ${PLAINTEXT}`);
  expect(generated).toContain('include /etc/redis/smoke-*.conf');
  expect(generated).toContain('loadmodule /opt/modules/smoke.so');
  expect(generated).toContain(`user smoke on ~* +@all >${PLAINTEXT}`);
  expect(generated).toContain('rename-command CONFIG "smoke-config"');
  await page.screenshot({ path: path.join(ARTIFACTS, '08-wizard-finish.png'), fullPage: true });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下载 conf' }).click(),
  ]);
  expect(dialogs.some((message) => message.includes('明文密码'))).toBe(true);
  expect(download.suggestedFilename()).toBe('redis-7.4.conf');
  const downloadPath = path.join(ARTIFACTS, 'export-configurator.conf');
  await download.saveAs(downloadPath);
  const downloaded = readFileSync(downloadPath, 'utf8');
  expect(downloaded).toContain('port 6390');
  expect(downloaded).toContain('save 3600 1\nsave 300 100');
  expect(downloaded).toContain(`requirepass ${PLAINTEXT}`);
  expect(downloaded).toContain('rename-command CONFIG "smoke-config"');

  await page.getByRole('button', { name: '带回体检页' }).click();
  await expect(page).toHaveURL(/\/$/);
  const editorPane = page.getByRole('region', { name: '你的配置' });
  await expect(editorPane.getByText(/\d+ 行 · 已改 [1-9]/)).toBeVisible();
  await expect(page.getByRole('region', { name: '体检结果' })).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('zilucid:state') ?? ''))
    .toContain('${env_requirepass}');
  const stored = await page.evaluate(() => localStorage.getItem('zilucid:state') ?? '');
  expect(stored).toContain('port 6390');
  expect(stored).toContain('user smoke on');
  expect(stored).not.toContain(PLAINTEXT);
  const draftStored = await page.evaluate(() => localStorage.getItem('zilucidredis.configurator.v1') ?? '');
  expect(draftStored).toContain('6390');
  expect(draftStored).not.toContain(PLAINTEXT);

  await page.locator('.cm-content').first().click();
  await page.keyboard.press('Control+f');
  const findBox = page.getByRole('search', { name: '在你的配置中查找' });
  await expect(findBox).toBeVisible();
  await findBox.getByRole('searchbox').fill('${env_requirepass}');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-content').first()).toContainText('${env_requirepass}');
  await expect(page.locator('.cm-content').first()).not.toContainText(PLAINTEXT);
  await page.screenshot({ path: path.join(ARTIFACTS, '09-wizard-handoff.png'), fullPage: true });
});

test('向导硬加载与刷新：草稿恢复、敏感值不落盘', async ({ page }) => {
  // vite preview 的 SPA fallback 与 GitHub Pages 的 404.html 是两套机制，此断言不等价线上验证。
  await page.goto('/configurator');
  await expect(page.getByRole('heading', { name: '生成配置' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '配置步骤' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '选择 Redis 版本' })).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, '10-wizard-hardload.png'), fullPage: true });

  const nav = page.getByRole('navigation', { name: '配置步骤' });
  await nav.getByRole('button', { name: '网络' }).click();
  await page.getByLabel('port', { exact: true }).fill('6390');
  await nav.getByRole('button', { name: '安全' }).click();
  await page.getByLabel('requirepass', { exact: true }).fill(PLAINTEXT);
  await expect(page.getByText('已改 2 项')).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/configurator$/);
  await expect(page.getByRole('heading', { name: '生成配置' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '选择 Redis 版本' })).toBeVisible();

  await nav.getByRole('button', { name: '网络' }).click();
  await expect(page.getByLabel('port', { exact: true })).toHaveValue('6390');
  await nav.getByRole('button', { name: '安全' }).click();
  await expect(page.getByLabel('requirepass', { exact: true })).toHaveValue('');
  await expect(page.getByText('敏感值不保存，刷新后需重新填写。').first()).toBeVisible();
  await expect(page.getByText('已改 1 项')).toBeVisible();

  const draftStored = await page.evaluate(() => localStorage.getItem('zilucidredis.configurator.v1') ?? '');
  expect(draftStored).toContain('6390');
  expect(draftStored).not.toContain(PLAINTEXT);
  const checkupStored = await page.evaluate(() => localStorage.getItem('zilucid:state') ?? '');
  expect(checkupStored).not.toContain(PLAINTEXT);
  await page.screenshot({ path: path.join(ARTIFACTS, '11-wizard-reload.png'), fullPage: true });
});
