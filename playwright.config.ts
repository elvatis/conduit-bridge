import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.pw.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  timeout: 60_000,
  outputDir: '.ai/logs/browser-results',
  reporter: [['list'], ['html', { outputFolder: '.ai/logs/browser-report', open: 'never' }]],
  use: {
    browserName: 'chromium',
    channel: process.env.CONDUIT_TEST_BROWSER || undefined,
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
