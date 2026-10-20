// A8: backup and restore of the database plus the stored pictures (REWRITE_PLAN §8).
//
// One backup = one folder `excise-backup-<time>-<kind>` inside the chosen backup folder (a USB
// drive or a network share), holding `database.sqlite`, `files/` and `backup.json` (kind, time,
// SHA-256 of the database). A backup is written under a `.partial` name and renamed when complete,
// so a half-written backup is never listed or restored.
//
// What depends on the database driver is behind `DatabaseFiles`; packages/db implements it.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupCheck, BackupInfo, BackupService, BackupSettings } from '@excise/contract';

/** The three things backup needs from the database layer. */
export interface DatabaseFiles {
  /** Writes a consistent copy of the live database to `file` (SQLite: `VACUUM INTO`). */
  snapshot(file: string): Promise<void>;
  /** Integrity check of a database file: `'ok'` or a description of the problem. */
  check(file: string): Promise<string>;
  /** Replaces the live database with a copy of `file` (closes and reopens the connection). */
  replace(file: string): Promise<void>;
}

export class BackupError extends Error {
  constructor(public readonly code: 'no_folder' | 'bad_backup' | 'not_found') {
    super(code);
  }
}

export interface BackupDeps {
  db: DatabaseFiles;
  /** Live pictures folder (`<userData>/files`). */
  filesDir: string;
  /** JSON file holding `BackupSettings`. */
  settingsFile: string;
  /** Where the safety copy before a restore goes when no backup folder is set yet. */
  safetyDir: string;
  appVersion: string;
  now?: () => Date;
}

const PREFIX = 'excise-backup-';
const MANIFEST = 'backup.json';
const DB_FILE = 'database.sqlite';
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SETTINGS: BackupSettings = {
  folder: null,
  keep: 14,
  dailyEnabled: true,
  lastBackupAt: null,
};

interface Manifest {
  format: 1;
  kind: BackupInfo['kind'];
  createdAt: string;
  appVersion: string;
  databaseSha256: string;
  files: number;
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function sizeOf(path: string): Promise<number> {
  const s = await stat(path);
  if (!s.isDirectory()) return s.size;
  let total = 0;
  for (const name of await readdir(path)) total += await sizeOf(join(path, name));
  return total;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

export class DefaultBackupService implements BackupService {
  private readonly now: () => Date;

  constructor(private readonly deps: BackupDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async settings(): Promise<BackupSettings> {
    try {
      const raw = JSON.parse(
        await readFile(this.deps.settingsFile, 'utf8'),
      ) as Partial<BackupSettings>;
      return { ...DEFAULT_SETTINGS, ...raw };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private async save(settings: BackupSettings): Promise<BackupSettings> {
    await mkdir(join(this.deps.settingsFile, '..'), { recursive: true });
    await writeFile(this.deps.settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    return settings;
  }

  async updateSettings(
    patch: Partial<Omit<BackupSettings, 'lastBackupAt'>>,
  ): Promise<BackupSettings> {
    const cur = await this.settings();
    return this.save({
      ...cur,
      ...(patch.folder !== undefined ? { folder: patch.folder } : {}),
      ...(patch.keep !== undefined ? { keep: Math.max(1, Math.floor(patch.keep)) } : {}),
      ...(patch.dailyEnabled !== undefined ? { dailyEnabled: patch.dailyEnabled } : {}),
    });
  }

  async backupNow(kind: BackupInfo['kind'] = 'manual'): Promise<BackupInfo> {
    const settings = await this.settings();
    if (!settings.folder) throw new BackupError('no_folder');
    const info = await this.writeBackup(settings.folder, kind);
    await this.save({ ...settings, lastBackupAt: info.createdAt });
    if (kind === 'auto') await this.prune(settings.folder, settings.keep);
    return info;
  }

  private async writeBackup(folder: string, kind: BackupInfo['kind']): Promise<BackupInfo> {
    const createdAt = this.now().toISOString();
    let name = `${PREFIX}${createdAt.replace(/[:.]/g, '-')}-${kind}`;
    for (let n = 2; await exists(join(folder, name)); n++) {
      name = `${PREFIX}${createdAt.replace(/[:.]/g, '-')}-${kind}-${n}`;
    }
    const partial = join(folder, `${name}.partial`);
    await rm(partial, { recursive: true, force: true });
    await mkdir(partial, { recursive: true });
    try {
      const dbFile = join(partial, DB_FILE);
      await this.deps.db.snapshot(dbFile);
      let files = 0;
      if (await exists(this.deps.filesDir)) {
        await cp(this.deps.filesDir, join(partial, 'files'), { recursive: true });
        files = (await readdir(this.deps.filesDir)).length;
      } else {
        await mkdir(join(partial, 'files'));
      }
      const manifest: Manifest = {
        format: 1,
        kind,
        createdAt,
        appVersion: this.deps.appVersion,
        databaseSha256: await sha256File(dbFile),
        files,
      };
      await writeFile(join(partial, MANIFEST), JSON.stringify(manifest, null, 2), 'utf8');
      await rename(partial, join(folder, name));
    } catch (e) {
      await rm(partial, { recursive: true, force: true });
      throw e;
    }
    return { name, createdAt, kind, sizeBytes: await sizeOf(join(folder, name)) };
  }

  /** Keeps the newest `keep` automatic backups; manual and pre-restore backups are never pruned. */
  private async prune(folder: string, keep: number): Promise<void> {
    const autos = (await this.listIn(folder)).filter((b) => b.kind === 'auto');
    for (const old of autos.slice(keep)) {
      await rm(join(folder, old.name), { recursive: true, force: true });
    }
  }

  private async readManifest(dir: string): Promise<Manifest | null> {
    try {
      const m = JSON.parse(await readFile(join(dir, MANIFEST), 'utf8')) as Manifest;
      return m.format === 1 ? m : null;
    } catch {
      return null;
    }
  }

  private async listIn(folder: string): Promise<BackupInfo[]> {
    let names: string[];
    try {
      names = await readdir(folder);
    } catch {
      return [];
    }
    const out: BackupInfo[] = [];
    for (const name of names) {
      if (!name.startsWith(PREFIX) || name.endsWith('.partial')) continue;
      const m = await this.readManifest(join(folder, name));
      if (!m) continue;
      out.push({
        name,
        createdAt: m.createdAt,
        kind: m.kind,
        sizeBytes: await sizeOf(join(folder, name)),
      });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listBackups(): Promise<BackupInfo[]> {
    const { folder } = await this.settings();
    return folder ? this.listIn(folder) : [];
  }

  async verify(backupDir: string): Promise<BackupCheck> {
    const m = await this.readManifest(backupDir);
    if (!m) return { ok: false, detail: 'backup.json is missing or unreadable' };
    const dbFile = join(backupDir, DB_FILE);
    if (!(await exists(dbFile))) return { ok: false, detail: `${DB_FILE} is missing` };
    if ((await sha256File(dbFile)) !== m.databaseSha256) {
      return { ok: false, detail: 'the database file has changed since the backup was made' };
    }
    if (!(await exists(join(backupDir, 'files'))))
      return { ok: false, detail: 'files/ is missing' };
    const result = await this.deps.db.check(dbFile);
    return { ok: result === 'ok', detail: result };
  }

  async restore(backupDir: string): Promise<void> {
    const check = await this.verify(backupDir);
    if (!check.ok) throw new BackupError('bad_backup');

    // Safety copy of the current data first, so a wrong restore can be undone.
    const { folder } = await this.settings();
    await this.writeBackup(folder ?? this.deps.safetyDir, 'before_restore');

    // Stage the pictures next to the live folder, swap the database, then swap the pictures.
    const staged = `${this.deps.filesDir}.restoring`;
    await rm(staged, { recursive: true, force: true });
    await cp(join(backupDir, 'files'), staged, { recursive: true });
    await this.deps.db.replace(join(backupDir, DB_FILE));
    await rm(this.deps.filesDir, { recursive: true, force: true });
    await rename(staged, this.deps.filesDir);
  }

  async isDue(now: Date): Promise<boolean> {
    const s = await this.settings();
    if (!s.dailyEnabled || !s.folder) return false;
    return !s.lastBackupAt || now.getTime() - Date.parse(s.lastBackupAt) >= DAY_MS;
  }

  /** Absolute folder of a backup listed by `listBackups`, for the IPC layer (names only from the UI). */
  async resolve(name: string): Promise<string> {
    const { folder } = await this.settings();
    if (!folder || !(await this.listIn(folder)).some((b) => b.name === name)) {
      throw new BackupError('not_found');
    }
    return join(folder, name);
  }
}
