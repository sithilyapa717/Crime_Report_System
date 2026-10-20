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
  /** The test's own data folder (database, generated documents, saved files). */
  userData: string;
  app: ElectronApplication;
  page: Page;
  /** Messages the page logged at error level (CSP violations show up here). */
  errors: string[];
  close: () => Promise<void>;
}

export async function startApp(env: Record<string, string> = {}): Promise<Running> {
  const userData = mkdtempSync(join(tmpdir(), 'excise-e2e-'));
  // EXCISE_E2E_EXE: run the flows against the packaged app (release/win-unpacked/…exe) instead.
  const exe = process.env.EXCISE_E2E_EXE;
  const app = await _electron.launch({
    executablePath: exe ?? electronPath,
    args: exe ? [`--user-data-dir=${userData}`] : [mainDir, `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      EXCISE_DOCUMENTS_DIR: join(userData, 'documents'),
      ...env,
    } as Record<string, string>,
  });
  // Native dialogs and the shell cannot be driven by Playwright: save dialogs answer with a file
  // in the test folder, and "open" / "show in folder" are recorded instead of opening Word.
  await app.evaluate(({ dialog, shell }, dir) => {
    const g = globalThis as unknown as { __opened: string[] };
    g.__opened = [];
    let n = 0;
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const opts = (args.length > 1 ? args[1] : args[0]) as { defaultPath?: string };
      n += 1;
      return { canceled: false, filePath: `${dir}/saved-${n}-${opts.defaultPath ?? 'file'}` };
    }) as typeof dialog.showSaveDialog;
    shell.openPath = (async (p: string) => {
      g.__opened.push(p);
      return '';
    }) as typeof shell.openPath;
    shell.showItemInFolder = (p: string) => void g.__opened.push(`folder:${p}`);
    // Open dialogs (backup folder, Access file) answer with what the test set last.
    const o = globalThis as unknown as { __nextOpen: string | null };
    o.__nextOpen = null;
    dialog.showOpenDialog = (async () =>
      o.__nextOpen
        ? { canceled: false, filePaths: [o.__nextOpen] }
        : { canceled: true, filePaths: [] }) as typeof dialog.showOpenDialog;
  }, userData);
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForLoadState('domcontentloaded');
  return {
    userData,
    app,
    page,
    errors,
    close: async () => {
      await app.close();
      rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

/** Paths the app tried to open with the shell (see the stubs in startApp). */
export const openedPaths = (run: Running) =>
  run.app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened);

/** What the next file or folder dialog answers. */
export const answerNextOpen = (run: Running, path: string) =>
  run.app.evaluate((_e, p) => {
    (globalThis as unknown as { __nextOpen: string | null }).__nextOpen = p;
  }, path);
