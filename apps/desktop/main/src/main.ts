// Electron main process: one window, a sandboxed renderer, and a single IPC entry point.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { createDevRepositories } from './dev-seed.js';
import { createServiceHost, dispatch } from './host.js';
import { createFileLogger, type Logger } from './log.js';

export const IPC_CHANNEL = 'excise:call';

let log: Logger | null = null;

/** Shows a plain error box with the log location, then quits. Used when the app cannot continue. */
function fatal(title: string, err: unknown): void {
  log?.error(title, err);
  const where = log ? `\n\nDetails were saved to:\n${log.file}` : '';
  dialog.showErrorBox(title, `The application must close.${where}`);
  app.exit(1);
}

/** Vite dev server for C's renderer, or the built renderer next to the app. */
const devUrl = process.env.EXCISE_RENDERER_URL;
const rendererFile = join(__dirname, '../../renderer/dist/index.html');

function isTrustedSender(url: string): boolean {
  if (!devUrl) return url.startsWith(pathToFileURL(rendererFile).href);
  try {
    return new URL(url).origin === new URL(devUrl).origin;
  } catch {
    return false; // empty or malformed URL
  }
}

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());

  // No in-app navigation or pop-ups; external links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedSender(url)) event.preventDefault();
  });

  if (devUrl) await win.loadURL(devUrl);
  else await win.loadFile(rendererFile);
  return win;
}

async function start(): Promise<void> {
  await app.whenReady();
  log = createFileLogger(join(app.getPath('logs'), 'main.log'));
  log.info(`start version=${app.getVersion()} electron=${process.versions.electron}`);

  // TODO(A): replace with the SQLite repositories from packages/db when they land.
  const repos = await createDevRepositories();

  let win: BrowserWindow | null = null;
  const { handlers } = createServiceHost(repos, {
    pickSavePath: async (defaultName) => {
      const options = { defaultPath: defaultName };
      const r = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      return r.canceled || !r.filePath ? null : r.filePath;
    },
  });

  ipcMain.handle(IPC_CHANNEL, async (event, channel: unknown, args: unknown) => {
    const url = event.senderFrame?.url ?? '';
    if (!isTrustedSender(url)) {
      return { ok: false, error: { name: 'Forbidden', message: 'Untrusted sender' } };
    }
    const result = await dispatch(handlers, channel, args);
    // Channel and error type only: arguments hold personal data and passwords.
    if (channel === 'auth.login') {
      if (result.ok) log?.info(`login ok role=${(result.value as { role: string }).role}`);
      else log?.warn(`login failed code=${result.error.code ?? result.error.name}`);
    } else if (!result.ok) {
      log?.warn(
        `call failed channel=${String(channel)} error=${result.error.name}${result.error.code ? ` code=${result.error.code}` : ''}`,
      );
    }
    return result;
  });

  win = await createWindow();
  let lastReload = 0;
  win.webContents.on('render-process-gone', (_event, details) => {
    log?.error(`renderer gone reason=${details.reason} exitCode=${details.exitCode}`);
    if (details.reason === 'clean-exit') return;
    // Reload once; a second crash within a minute means it will keep crashing.
    if (Date.now() - lastReload < 60_000) {
      fatal('The screen stopped working', new Error(`renderer ${details.reason}`));
      return;
    }
    lastReload = Date.now();
    win?.reload();
  });
  app.on('window-all-closed', () => app.quit());
}

process.on('unhandledRejection', (e) => {
  if (log) log.error('unhandled rejection', e);
  else console.error('[main] unhandled rejection', e);
});
process.on('uncaughtException', (e) => fatal('Unexpected error', e));
start().catch((e: unknown) => fatal('The application could not start', e));
