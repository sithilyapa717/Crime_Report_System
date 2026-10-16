// Optional PDF export through Microsoft Word (REWRITE_PLAN §6: "Optional PDF export through Word
// when it is installed"). The PDF is written next to the .docx and never overwrites a file.
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { withCopyNumber } from './filename.ts';

const run = promisify(execFile);

export class PdfExportUnavailableError extends Error {}

export type PdfExporter = (docxPath: string) => Promise<string>;

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

/** Converts with Word; throws PdfExportUnavailableError when not on Windows or Word is missing. */
export const exportPdfWithWord: PdfExporter = async (docxPath) => {
  if (process.platform !== 'win32') throw new PdfExportUnavailableError('PDF export needs Windows and Microsoft Word');
  const base = basename(docxPath).replace(/\.docx$/i, '.pdf');
  let pdfPath = join(dirname(docxPath), base);
  for (let n = 2; await exists(pdfPath); n++) pdfPath = join(dirname(docxPath), withCopyNumber(base, n));
  try {
    await run(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(import.meta.dirname, 'docx-to-pdf.ps1'), docxPath, pdfPath],
      { timeout: 120_000, windowsHide: true },
    );
  } catch (e) {
    const err = e as { code?: number; stderr?: string };
    if (err.code === 3 || /WORD_NOT_AVAILABLE/.test(err.stderr ?? '')) {
      throw new PdfExportUnavailableError('Microsoft Word is not installed');
    }
    throw e;
  }
  return pdfPath;
};
