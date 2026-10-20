// A8: the database steps of a backup (DatabaseFiles in @excise/backup, implemented here).
import { copyFile, rm } from 'node:fs/promises';
import Database from 'better-sqlite3';
import type { ExciseDb } from '../src/connection.js';

export interface DatabaseFiles {
  snapshot(file: string): Promise<void>;
  check(file: string): Promise<string>;
  replace(file: string): Promise<void>;
}

export function sqliteDatabaseFiles(db: ExciseDb): DatabaseFiles {
  return {
    /** A consistent copy of the live database, even while the app is running. */
    async snapshot(file) {
      await rm(file, { force: true });
      db.sqlite.prepare('VACUUM INTO ?').run(file);
    },
    /** `ok`, or what SQLite's integrity and foreign-key checks found. */
    async check(file) {
      let conn: Database.Database | null = null;
      try {
        conn = new Database(file, { readonly: true, fileMustExist: true });
        const integrity = (conn.pragma('integrity_check') as { integrity_check: string }[]).map(
          (r) => r.integrity_check,
        );
        if (integrity.join() !== 'ok') return integrity.slice(0, 5).join('; ');
        const fk = conn.pragma('foreign_key_check') as unknown[];
        if (fk.length) return `${fk.length} broken references`;
        const hasCrs = conn
          .prepare("SELECT 1 FROM sqlite_master WHERE name = 'crime_reports'")
          .get();
        return hasCrs ? 'ok' : 'not an Excise database';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      } finally {
        conn?.close();
      }
    },
    /** Closes the live database, puts the copy in its place and opens it again (migrating it). */
    async replace(file) {
      if (db.file === ':memory:') throw new Error('cannot replace an in-memory database');
      await db.close();
      try {
        await copyFile(file, db.file);
        await rm(`${db.file}-wal`, { force: true });
        await rm(`${db.file}-shm`, { force: true });
      } finally {
        await db.reopen();
      }
    },
  };
}
