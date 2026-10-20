// Playwright drives the real Electron app (no browser download needed). Run: pnpm test:e2e
// (builds first). Each test starts the app on a fresh, empty data folder.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  outputDir: '../../.cache/e2e-results',
});
