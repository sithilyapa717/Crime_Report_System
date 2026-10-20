// Reads a legacy Access file through read-accdb.ps1 (DAO, Windows only). The source file is
// copied first and only the copy is opened, so the original is never touched (REWRITE_PLAN §7.4).
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface LegacyColumn {
  name: string;
  /** DAO field type (8 = date, 10 = text, 1 = yes/no, 101 = attachment, …). */
  type: number;
}

export interface LegacyTable {
  columns: LegacyColumn[];
  rows: Record<string, unknown>[];
}

export interface LegacyAttachment {
  table: string;
  /** 0-based row index within the table. */
  row: number;
  field: string;
  fileName: string;
  /** Extracted copy in the work folder. */
  path: string;
}

export interface LegacyDatabase {
  tables: Record<string, LegacyTable>;
  attachments: LegacyAttachment[];
}

export class AccessReaderError extends Error {
  constructor(
    public readonly code: 'not_windows' | 'engine_missing' | 'read_failed',
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** read-accdb.ps1 next to this file; the packaged app passes the unpacked copy's path. */
export const READ_ACCDB_SCRIPT = join(import.meta.dirname ?? '.', 'read-accdb.ps1');

export type AccdbReader = (accdbPath: string) => Promise<LegacyDatabase>;

/**
 * @param workDir an empty folder for the copy and the extracted attachments (deleted by `cleanup`).
 */
export function accessReader(workDir: string, scriptPath: string = READ_ACCDB_SCRIPT): AccdbReader {
  return async (accdbPath) => {
    if (process.platform !== 'win32') throw new AccessReaderError('not_windows');
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });
    const copy = join(workDir, `copy-${basename(accdbPath)}`);
    await copyFile(accdbPath, copy);
    const out = join(workDir, 'out');
    try {
      await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          copy,
          out,
        ],
        { timeout: 10 * 60_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      );
    } catch (e) {
      const err = e as { code?: number; stderr?: string; message?: string };
      if (err.code === 3 || /ACCESS_ENGINE_NOT_AVAILABLE/.test(err.stderr ?? '')) {
        throw new AccessReaderError('engine_missing');
      }
      throw new AccessReaderError(
        'read_failed',
        (err.stderr || err.message || '').trim().slice(0, 500),
      );
    }
    const raw = await readFile(join(out, 'data.json'), 'utf8');
    // PowerShell may write a byte-order mark first.
    const data = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as LegacyDatabase;
    // PowerShell writes a one-element list as a bare object; normalise.
    for (const t of Object.values(data.tables)) {
      t.columns = asArray(t.columns);
      t.rows = asArray(t.rows);
    }
    data.attachments = asArray(data.attachments);
    return data;
  };
}

function asArray<T>(v: T[] | T | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
