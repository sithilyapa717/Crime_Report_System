// The Electron pieces the service host needs: dialogs, shell and printing. The renderer never
// passes paths; every path comes from one of these dialogs or from the app's own folders.
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WordFonts } from '@excise/documents';
import { app, BrowserWindow, dialog, shell } from 'electron';
import type { HostOptions } from './host.js';
import type { PrintOutput } from './print.js';

type Win = () => BrowserWindow | null;

export function createDialogs(
  win: Win,
): Pick<
  HostOptions,
  'pickSavePath' | 'pickOpenPath' | 'pickFolder' | 'openPath' | 'showItemInFolder'
> {
  return {
    pickSavePath: async (defaultName) => {
      const w = win();
      const options = { defaultPath: defaultName };
      const r = w ? await dialog.showSaveDialog(w, options) : await dialog.showSaveDialog(options);
      return r.canceled || !r.filePath ? null : r.filePath;
    },
    pickOpenPath: async (kind) => {
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [
          kind === 'accdb'
            ? { name: 'Access database', extensions: ['accdb', 'mdb'] }
            : {
                name: 'Pictures / PDF',
                extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'pdf'],
              },
        ],
      };
      const w = win();
      const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options);
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    pickFolder: async () => {
      const options: Electron.OpenDialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
      };
      const w = win();
      const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options);
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    openPath: async (path) => {
      const error = await shell.openPath(path);
      if (error) throw new Error(error);
    },
    showItemInFolder: (path) => shell.showItemInFolder(path),
  };
}

/**
 * The app's own Sinhala font for the print window, so a PC without any Sinhala font still prints
 * Sinhala instead of boxes. Inline (data: URLs), because a file:// page may not load other files.
 */
function withSinhalaFont(html: string, fonts: WordFonts): string {
  const face = (font: Buffer, weight: number) =>
    `@font-face { font-family: "Noto Sans Sinhala"; font-weight: ${weight}; ` +
    `src: url(data:font/ttf;base64,${font.toString('base64')}) format("truetype"); ` +
    `unicode-range: U+0964-0965, U+0D81-0DF4, U+200C-200D, U+25CC; }`;
  return html.replace(
    '<head>',
    `<head><style>${face(fonts.regular, 400)}${face(fonts.bold, 700)}</style>`,
  );
}

/**
 * Renders a print layout in a hidden, script-free window, then prints it (system printer dialog)
 * or saves it as an A4 PDF where the user chooses.
 */
export function createPrintOutput(
  pickSavePath: HostOptions['pickSavePath'],
  fonts?: WordFonts,
): PrintOutput {
  return async (layout, target, defaultName) => {
    // A temporary file, not a data: URL: large registers exceed the data URL size limit.
    const file = join(app.getPath('temp'), `excise-print-${randomUUID()}.html`);
    await writeFile(file, fonts ? withSinhalaFont(layout.html, fonts) : layout.html, 'utf8');
    const w = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
    });
    try {
      await w.loadFile(file);
      if (target === 'printer') {
        return await new Promise<boolean>((resolve) =>
          w.webContents.print({ landscape: layout.landscape }, (ok) => resolve(ok)),
        );
      }
      const path = await pickSavePath(defaultName);
      if (!path) return null;
      const pdf = await w.webContents.printToPDF({
        landscape: layout.landscape,
        pageSize: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: layout.footerTemplate,
      });
      await writeFile(path, pdf);
      return path;
    } finally {
      w.destroy();
      await rm(file, { force: true });
    }
  };
}
