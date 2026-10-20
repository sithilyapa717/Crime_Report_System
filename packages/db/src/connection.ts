// The SQLite database: one better-sqlite3 connection, Kysely on top, migrations on open.
//
// Transactions: `db.transaction(fn)` runs `fn` in one SQLite transaction, and every repository
// call made inside it (on the same `ExciseDb`) joins it, through AsyncLocalStorage. Nested calls
// join the outer transaction. That is how a CR and its child rows, or a whole Access import, are
// saved all-or-nothing.
import { AsyncLocalStorage } from 'node:async_hooks';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, type Transaction } from 'kysely';
import { MIGRATIONS } from '../migrations/index.js';
import type { DB } from '../schema/tables.js';
import type { DbHandle } from './handle.js';

export interface OpenOptions {
  /** Who is making changes, for `updated_by` (the session's user id). */
  currentUser?: () => string | null;
}

export class ExciseDb implements DbHandle {
  readonly dialect = 'sqlite' as const;
  private conn!: Database.Database;
  private kysely!: Kysely<DB>;
  private readonly tx = new AsyncLocalStorage<Transaction<DB>>();
  readonly currentUser: () => string | null;

  constructor(
    /** Database file, or `:memory:` for tests. */
    readonly file: string,
    opts: OpenOptions = {},
  ) {
    this.currentUser = opts.currentUser ?? (() => null);
    this.open();
  }

  private open(): void {
    this.conn = new Database(this.file);
    if (this.file !== ':memory:') this.conn.pragma('journal_mode = WAL');
    this.conn.pragma('foreign_keys = ON');
    this.conn.pragma('busy_timeout = 5000');
    this.kysely = new Kysely<DB>({ dialect: new SqliteDialect({ database: this.conn }) });
    this.migrate();
  }

  /** The query builder: the current transaction's when inside `transaction`, otherwise the root. */
  get q(): Kysely<DB> {
    return this.tx.getStore() ?? this.kysely;
  }

  /** The raw connection, for backups and checks. */
  get sqlite(): Database.Database {
    return this.conn;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.tx.getStore()) return fn();
    return this.kysely.transaction().execute((trx) => this.tx.run(trx, fn));
  }

  /** Applies migrations not applied yet, each in its own transaction. Returns their names. */
  migrate(): string[] {
    this.conn.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
    const done = new Set(
      (this.conn.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map(
        (r) => r.name,
      ),
    );
    const applied: string[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      const run = this.conn.transaction(() => {
        this.conn.exec(m.sql);
        this.conn
          .prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
          .run(m.name, new Date().toISOString());
      });
      run();
      applied.push(m.name);
    }
    return applied;
  }

  /** Closes the connection; `reopen` opens the same file again (after a restore). */
  async close(): Promise<void> {
    await this.kysely.destroy();
    // Kysely only closes a connection it has used; migrations use it directly.
    if (this.conn.open) this.conn.close();
  }

  async reopen(): Promise<void> {
    this.open();
  }
}

export function openDatabase(file: string, opts?: OpenOptions): ExciseDb {
  return new ExciseDb(file, opts);
}
