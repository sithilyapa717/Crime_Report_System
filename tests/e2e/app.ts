// Starts the built app on a new, empty data folder (its own SQLite database).
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';

const root = join(import.meta.dirname, '../..');
const mainDir = join(root, 'apps/desktop/main');
const electronPath = createRequire(join(mainDir, 'package.json'))('electron') as unknown as string;

/** Screenshots for reviewing the screens (ignored by git). */
export const SHOTS = join(root, '.cache/e2e-shots');

export interface Running {
  app: ElectronApplication;
  page: Page;
  /** Messages the page logged at error level (CSP violations show up here). */
  errors: string[];
  close: () => Promise<void>;
}

export async function startApp(env: Record<string, string> = {}): Promise<Running> {
  const userData = mkdtempSync(join(tmpdir(), 'excise-e2e-'));
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [mainDir, `--user-data-dir=${userData}`],
    env: { ...process.env, ...env } as Record<string, string>,
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForLoadState('domcontentloaded');
  return {
    app,
    page,
    errors,
    close: async () => {
      await app.close();
      rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
