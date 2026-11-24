import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  outputDir: './.screenshots/smoke-results',
  forbidOnly: isCI,
  fullyParallel: false,
  workers: 1,
  reporter: isCI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: isCI ? 'npm run preview' : 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !isCI,
    timeout: 180000,
  },
});
