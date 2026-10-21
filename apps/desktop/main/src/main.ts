// Electron main process: one window, a sandboxed renderer, and a single IPC entry point.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DocumentGenerator,
  JsonLinesGenerationLog,
  JsonTemplateSource,
  TemplateRegistry,
  wordPdfExporter,
} from '@excise/documents';
import { accessReader } from '@excise/migration';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { DefaultBackupService } from '@excise/backup';
import type { SessionHolder } from '@excise/auth';
import { createSqliteRepositories, openDatabase } from '@excise/db';
import { createDevRepositories } from './dev-seed.js';
import { createDialogs, createPrintOutput } from './electron-parts.js';
import { fontStatus, windowsFonts } from './fonts.js';
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

/**
 * D's templates, registry and PowerShell script. The installer ships them as real files outside
 * the asar archive (PowerShell cannot read inside it); in development they are read from the repo.
 */
const documentsRoot = app.isPackaged
  ? join(process.resourcesPath, 'documents')
  : join(__dirname, '../../../../packages/documents');

/** The Access reader script (PowerShell), shipped outside asar like D's files. */
const readAccdbScript = app.isPackaged
  ? join(process.resourcesPath, 'migration', 'read-accdb.ps1')
  : join(__dirname, '../../../../packages/migration/src/reader/read-accdb.ps1');

const BACKUP_CHECK_MS = 60 * 60 * 1000;

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

  const userData = app.getPath('userData');
  const filesDir = join(userData, 'files');
  const templatesJson = new JsonTemplateSource(join(documentsRoot, 'registry', 'templates.json'));

  // The SQLite database in the user data folder; EXCISE_MOCK=1 runs on in-memory dev data.
  const mock = process.env.EXCISE_MOCK === '1';
  let sessions: SessionHolder | null = null;
  const sqlite = mock
    ? null
    : createSqliteRepositories(
        openDatabase(join(userData, 'excise.sqlite'), {
          currentUser: () => sessions?.get()?.userId ?? null,
        }),
      );
  log.info(mock ? 'mock mode: in-memory dev data' : `database ${sqlite!.db.file}`);
  const repos = sqlite ?? (await createDevRepositories());

  // D's registry lives in document_templates (templates.json seeds new entries); the log in
  // generated_documents. Mock mode keeps the JSON files.
  if (sqlite) await sqlite.templates.seed(await templatesJson.list());
  const registry = await TemplateRegistry.load(sqlite?.templates ?? templatesJson);
  const generationLog =
    sqlite?.generationLog ??
    new JsonLinesGenerationLog(join(userData, 'generated-documents.jsonl'));
  const backup = sqlite
    ? new DefaultBackupService({
        db: sqlite.databaseFiles,
        filesDir,
        settingsFile: join(userData, 'backup-settings.json'),
        safetyDir: join(userData, 'before-restore'),
        appVersion: app.getVersion(),
      })
    : undefined;
  const generator = new DocumentGenerator({
    registry,
    originalsDir: join(documentsRoot, 'templates', 'original'),
    // EXCISE_DOCUMENTS_DIR: tests keep generated files out of the user's Documents folder.
    outputDir:
      process.env.EXCISE_DOCUMENTS_DIR ?? join(app.getPath('documents'), 'Excise documents'),
    log: generationLog,
    ...(process.platform === 'win32'
      ? { pdfExporter: wordPdfExporter(join(documentsRoot, 'generation', 'docx-to-pdf.ps1')) }
      : {}),
  });

  let win: BrowserWindow | null = null;
  const dialogs = createDialogs(() => win);
  const host = createServiceHost(repos, {
    ...dialogs,
    filesDir,
    ...(backup ? { backup } : {}),
    documents: { generator, registry, log: generationLog },
    printOutput: createPrintOutput(dialogs.pickSavePath),
    logFile: log.file,
    fontCheck: async () =>
      fontStatus(join(documentsRoot, 'registry', 'template-inventory.json'), await windowsFonts()),
    importer: {
      read: accessReader(join(app.getPath('temp'), 'excise-import'), readAccdbScript),
      reportFile: join(userData, 'import-report.json'),
      ...(sqlite ? { transaction: sqlite.transaction } : {}),
    },
    onRestored: () => {
      log?.info('restore finished, restarting');
      // Let the IPC reply reach the screen first.
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
    },
  });

  sessions = host.sessions;
  const { handlers, runScheduledBackup } = host;

  const scheduledBackup = () =>
    runScheduledBackup()
      .then((info) => info && log?.info(`automatic backup ${info.name}`))
      .catch((e: unknown) => log?.error('automatic backup failed', e));
  setTimeout(scheduledBackup, 2 * 60 * 1000);
  setInterval(scheduledBackup, BACKUP_CHECK_MS);

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
  app.on('will-quit', () => void sqlite?.db.close());
}

process.on('unhandledRejection', (e) => {
  if (log) log.error('unhandled rejection', e);
  else console.error('[main] unhandled rejection', e);
});
process.on('uncaughtException', (e) => fatal('Unexpected error', e));
start().catch((e: unknown) => fatal('The application could not start', e));
