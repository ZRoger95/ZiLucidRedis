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
