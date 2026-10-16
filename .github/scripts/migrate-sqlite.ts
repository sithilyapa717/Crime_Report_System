// Applies every plain-SQL migration in packages/db/migrations to a fresh in-memory SQLite
// database, in file-name order, then runs SQLite's integrity and foreign-key checks.
// Files ending in .down.sql are skipped.
// Usage: node .github/scripts/migrate-sqlite.ts
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { error, notice, walk } from './ci-lib.ts';

const migrations = walk('packages/db/migrations').filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'));
if (!migrations.length) {
  notice('No SQL migrations yet in packages/db/migrations (A). Check starts once the first one is added.');
  process.exit(0);
}

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
for (const file of migrations) {
  try {
    db.exec(readFileSync(file, 'utf8'));
    console.log(`applied ${file}`);
  } catch (e) {
    error(`Migration failed on a fresh SQLite database: ${(e as Error).message}`, file);
    process.exit(1);
  }
}

const integrity = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
const fk = db.prepare('PRAGMA foreign_key_check').all();
if (integrity[0]?.integrity_check !== 'ok' || fk.length) {
  error(`SQLite checks failed after migrations: ${JSON.stringify({ integrity, fk })}`);
  process.exit(1);
}
const tables = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number };
console.log(`Migrations OK: ${migrations.length} file(s) applied, ${tables.n} table(s).`);
