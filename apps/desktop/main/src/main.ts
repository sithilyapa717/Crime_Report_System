// Electron main process: one window, a sandboxed renderer, and a single IPC entry point.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { createDevRepositories } from './dev-seed.js';
import { createServiceHost, dispatch } from './host.js';

export const IPC_CHANNEL = 'excise:call';

/** Vite dev server for C's renderer, or the built renderer next to the app. */
const devUrl = process.env.EXCISE_RENDERER_URL;
const rendererFile = join(__dirname, '../../renderer/dist/index.html');

function isTrustedSender(url: string): boolean {
  if (devUrl) return new URL(url).origin === new URL(devUrl).origin;
  return url.startsWith(pathToFileURL(rendererFile).href);
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

  // TODO(A): replace with the SQLite repositories from packages/db when they land.
  const repos = await createDevRepositories();

  let win: BrowserWindow | null = null;
  const { handlers } = createServiceHost(repos, {
    pickSavePath: async (defaultName) => {
      const options = { defaultPath: defaultName };
      const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      return r.canceled || !r.filePath ? null : r.filePath;
    },
  });

  ipcMain.handle(IPC_CHANNEL, (event, channel: unknown, args: unknown) => {
    const url = event.senderFrame?.url ?? '';
    if (!isTrustedSender(url)) {
      return { ok: false, error: { name: 'Forbidden', message: 'Untrusted sender' } };
    }
    return dispatch(handlers, channel, args);
  });

  win = await createWindow();
  app.on('window-all-closed', () => app.quit());
}

process.on('unhandledRejection', (e) => console.error('[main] unhandled rejection', e));
start().catch((e: unknown) => {
  console.error('[main] failed to start', e);
  app.exit(1);
});
