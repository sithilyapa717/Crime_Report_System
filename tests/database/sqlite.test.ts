// What only the real database can show: rollback, constraints, file backups and restore.
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultBackupService } from '@excise/backup';
import { sampleCaseInput, sampleCrInput, seedSampleReferences } from '@excise/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, openDatabase, seedDemo, type ExciseDb } from '@excise/db';
import { MIGRATIONS } from '../../packages/db/migrations/index.ts';
import { toPostgres } from '../../packages/db/postgres-spike/pg-db.ts';

let tmp: string;
const opened: ExciseDb[] = [];
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'excise-db-'));
});
afterEach(async () => {
  // Windows cannot delete an open database file.
  for (const db of opened.splice(0)) await db.close().catch(() => undefined);
  await rm(tmp, { recursive: true, force: true });
});

function open(file: string) {
  const db = openDatabase(file, { currentUser: () => null });
  opened.push(db);
  return db;
}

async function fileDb(name = 'excise.sqlite') {
  const repos = createSqliteRepositories(open(join(tmp, name)));
  const refs = await seedSampleReferences(repos.references);
  return { repos, refs };
}

describe('SQLite database', () => {
  it('migrates once; opening again applies nothing', async () => {
    const { repos } = await fileDb();
    expect(repos.db.migrate()).toEqual([]);
    await repos.db.close();
    expect(open(join(tmp, 'excise.sqlite')).migrate()).toEqual([]);
  });

  it('a failing transaction leaves nothing behind, including nested repository writes', async () => {
    const { repos, refs } = await fileDb();
    await expect(
      repos.transaction(async () => {
        const cr = await repos.crs.insert(sampleCrInput(refs));
        await repos.cases.save(sampleCaseInput(cr.id, refs), null);
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect(await repos.queries.search({ kind: 'year', officeId: refs.office, year: 2026 })).toEqual(
      [],
    );
  });

  it('refuses a mismatched CR number, the wrong officer role, a bad outcome and a duplicate position', async () => {
    const { repos, refs } = await fileDb();
    const saved = await repos.crs.insert(sampleCrInput(refs));
    expect(saved.crNumber).toBe('1/2026');
    expect(repos.db.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(repos.db.sqlite.pragma('foreign_key_check')).toEqual([]);

    await expect(
      repos.crs.insert(sampleCrInput(refs, { crNumber: '5/2026', crYear: 2020 })),
    ).rejects.toThrow(/cr_number must match/);

    const driver = await repos.references.insert('driver', { value: 'Driver One' });
    await expect(
      repos.crs.insert(sampleCrInput(refs, { crNumber: '2/2026', detectingOfficerId: driver.id })),
    ).rejects.toThrow(/detecting_officer/);

    const savedCase = await repos.cases.save(sampleCaseInput(saved.id, refs), null);
    const at = new Date().toISOString();
    expect(() =>
      repos.db.sqlite
        .prepare(
          `INSERT INTO outcomes (id, case_id, position, outcome_type, add_to_convict_register, created_at, updated_at, version)
           VALUES (?, ?, 0, 'not_an_outcome', 0, ?, ?, 1)`,
        )
        .run(randomUUID(), savedCase!.id, at, at),
    ).toThrow(/outcome_type is not a known outcome/);

    expect(() =>
      repos.db.sqlite
        .prepare(
          `INSERT INTO seized_items (id, crime_report_id, position, item_type, quantity, unit, created_at, updated_at, version)
           VALUES (?, ?, 0, 'toddy', 1, 'L', ?, ?, 1)`,
        )
        .run(randomUUID(), saved.id, at, at),
    ).toThrow(/UNIQUE/);

    expect(() =>
      repos.db.sqlite
        .prepare(`UPDATE officers SET kind = 'driver' WHERE id = ?`)
        .run(refs.detectingOfficer),
    ).toThrow(/officer kind is immutable/);
  });

  it('translates the integrity triggers into PostgreSQL', () => {
    const sql = MIGRATIONS.find((m) => m.name === '0004_integrity')!.sql;
    const pg = toPostgres(sql);
    expect(pg).not.toContain('RAISE(ABORT');
    expect(pg).not.toMatch(/\binstr\(/);
    expect(pg).toContain('strpos(');
    expect(pg).toContain('EXECUTE FUNCTION crime_reports_integrity_insert()');
    expect(pg).toContain('CREATE UNIQUE INDEX seized_items_position');
    expect(pg).toContain('WHERE deleted_at IS NULL');
  });

  it('the database itself refuses two live CRs with one number, and bad dates', async () => {
    const { repos, refs } = await fileDb();
    await repos.crs.insert(sampleCrInput(refs));
    await expect(repos.crs.insert(sampleCrInput(refs))).rejects.toThrow(/UNIQUE/);
    await expect(
      repos.crs.insert(sampleCrInput(refs, { crNumber: '5/2026', detectionDate: '2026-02-30' })),
    ).rejects.toThrow(/CHECK/);
    // The failed insert left no half-written CR.
    expect(
      await repos.queries.search({ kind: 'year', officeId: refs.office, year: 2026 }),
    ).toHaveLength(1);
  });

  it('updated_by records the session user', async () => {
    let user: string | null = null;
    const repos = createSqliteRepositories(openDatabase(':memory:', { currentUser: () => user }));
    const refs = await seedSampleReferences(repos.references);
    const u = await repos.users.create({
      username: 'det',
      passwordHash: 'h',
      role: 'detecting',
      active: true,
      mustChangePassword: false,
    });
    user = u.id;
    const cr = await repos.crs.insert(sampleCrInput(refs));
    const row = repos.db.sqlite
      .prepare('SELECT updated_by FROM crime_reports WHERE id = ?')
      .get(cr.id) as { updated_by: string };
    expect(row.updated_by).toBe(u.id);
  });

  it('backup: snapshot while open, verify, damage detected, restore puts the old data back', async () => {
    const { repos, refs } = await fileDb();
    const files = join(tmp, 'files');
    const backup = new DefaultBackupService({
      db: repos.databaseFiles,
      filesDir: files,
      settingsFile: join(tmp, 'backup.json'),
      safetyDir: join(tmp, 'safety'),
      appVersion: 'test',
    });
    await backup.updateSettings({ folder: join(tmp, 'usb') });
    await repos.crs.insert(sampleCrInput(refs));
    const b = await backup.backupNow();
    const dir = await backup.resolve(b.name);
    expect(await backup.verify(dir)).toEqual({ ok: true, detail: 'ok' });

    await repos.crs.insert(sampleCrInput(refs, { crNumber: '2/2026' }));
    await backup.restore(dir);
    // The same repositories keep working on the reopened database.
    const crs = await repos.queries.search({ kind: 'year', officeId: refs.office, year: 2026 });
    expect(crs.map((c) => c.crNumber)).toEqual(['1/2026']);

    const notDb = join(tmp, 'not-a-db.sqlite');
    await writeFile(notDb, 'hello');
    expect(await repos.databaseFiles.check(notDb)).not.toBe('ok');
  });

  it('demo seed gives searchable, reportable data', async () => {
    const repos = createSqliteRepositories(openDatabase(':memory:'));
    const refs = seedDemo(repos.db, 200, { year: 2026 });
    const year = await repos.queries.search({ kind: 'year', officeId: refs.office, year: 2026 });
    expect(year.length).toBeGreaterThan(10);
    const rows = await repos.reportRows.rowsFor({
      kind: 'year',
      officeId: refs.office,
      year: 2026,
    });
    expect(rows).toHaveLength(year.length);
    expect(rows.some((r) => r.fineAmount)).toBe(true);
  });
});
