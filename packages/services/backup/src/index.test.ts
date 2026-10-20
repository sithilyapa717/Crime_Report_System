import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackupError, DefaultBackupService, type DatabaseFiles } from './index.js';

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'excise-backup-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

/** Stand-in for SQLite: the "database" is a text file. */
function fakeDb(live: string): DatabaseFiles {
  return {
    snapshot: (file) => copyFile(live, file),
    check: async (file) =>
      (await readFile(file, 'utf8')).includes('corrupt') ? 'page 3 bad' : 'ok',
    replace: (file) => copyFile(file, live),
  };
}

async function setup(start = '2026-10-20T08:00:00.000Z') {
  const live = join(tmp, 'live.db');
  const filesDir = join(tmp, 'files');
  const usb = join(tmp, 'usb');
  await writeFile(live, 'v1');
  await mkdir(filesDir);
  await writeFile(join(filesDir, 'a.png'), 'pic-a');
  let clock = new Date(start);
  const svc = new DefaultBackupService({
    db: fakeDb(live),
    filesDir,
    settingsFile: join(tmp, 'settings', 'backup.json'),
    safetyDir: join(tmp, 'safety'),
    appVersion: '0.0.0',
    now: () => clock,
  });
  const tick = (hours: number) => {
    clock = new Date(clock.getTime() + hours * 3600_000);
    return clock;
  };
  return { svc, live, filesDir, usb, tick };
}

describe('BackupService', () => {
  it('needs a folder; then backs up database and pictures with a manifest', async () => {
    const { svc, usb } = await setup();
    await expect(svc.backupNow()).rejects.toBeInstanceOf(BackupError);
    await svc.updateSettings({ folder: usb });
    const b = await svc.backupNow();
    expect(b.name).toMatch(/^excise-backup-2026-10-20T08-00-00-000Z-manual$/);
    expect((await readdir(join(usb, b.name))).sort()).toEqual([
      'backup.json',
      'database.sqlite',
      'files',
    ]);
    expect(await readFile(join(usb, b.name, 'files', 'a.png'), 'utf8')).toBe('pic-a');
    expect(await svc.listBackups()).toEqual([b]);
    expect((await svc.settings()).lastBackupAt).toBe(b.createdAt);
    expect(await svc.verify(join(usb, b.name))).toEqual({ ok: true, detail: 'ok' });
  });

  it('detects a changed or damaged backup', async () => {
    const { svc, usb } = await setup();
    await svc.updateSettings({ folder: usb });
    const b = await svc.backupNow();
    await writeFile(join(usb, b.name, 'database.sqlite'), 'v1 corrupt');
    expect((await svc.verify(join(usb, b.name))).ok).toBe(false);
    await expect(svc.restore(join(usb, b.name))).rejects.toMatchObject({ code: 'bad_backup' });
    expect((await svc.verify(join(tmp, 'nowhere'))).ok).toBe(false);
  });

  it('restores database and pictures after taking a safety copy', async () => {
    const { svc, usb, live, filesDir, tick } = await setup();
    await svc.updateSettings({ folder: usb });
    const b = await svc.backupNow();
    await writeFile(live, 'v2');
    await writeFile(join(filesDir, 'b.png'), 'pic-b');
    tick(1);
    await svc.restore(await svc.resolve(b.name));
    expect(await readFile(live, 'utf8')).toBe('v1');
    expect(await readdir(filesDir)).toEqual(['a.png']);
    const kinds = (await svc.listBackups()).map((x) => x.kind);
    expect(kinds).toEqual(['before_restore', 'manual']);
    const safety = (await svc.listBackups())[0]!;
    expect(await readFile(join(usb, safety.name, 'database.sqlite'), 'utf8')).toBe('v2');
  });

  it('restoring on a fresh PC puts the safety copy in the app folder', async () => {
    const { svc, usb, live } = await setup();
    await svc.updateSettings({ folder: usb });
    const b = await svc.backupNow();
    await svc.updateSettings({ folder: null });
    await writeFile(live, 'fresh');
    await svc.restore(join(usb, b.name));
    expect(await readFile(live, 'utf8')).toBe('v1');
    expect((await readdir(join(tmp, 'safety')))[0]).toMatch(/before_restore$/);
  });

  it('is due once a day and prunes old automatic backups only', async () => {
    const { svc, usb, tick } = await setup();
    expect(await svc.isDue(new Date())).toBe(false); // no folder yet
    await svc.updateSettings({ folder: usb, keep: 2 });
    const manual = await svc.backupNow('manual');
    expect(await svc.isDue(tick(23))).toBe(false);
    expect(await svc.isDue(tick(1))).toBe(true);
    for (let i = 0; i < 3; i++) {
      await svc.backupNow('auto');
      tick(24);
    }
    const left = await svc.listBackups();
    expect(left.filter((b) => b.kind === 'auto')).toHaveLength(2);
    expect(left.map((b) => b.name)).toContain(manual.name);
    await svc.updateSettings({ dailyEnabled: false });
    expect(await svc.isDue(tick(48))).toBe(false);
  });

  it('only resolves names that are listed backups', async () => {
    const { svc, usb } = await setup();
    await svc.updateSettings({ folder: usb });
    await expect(svc.resolve('excise-backup-nope')).rejects.toMatchObject({ code: 'not_found' });
  });
});
