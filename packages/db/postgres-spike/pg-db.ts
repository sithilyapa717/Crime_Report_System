// A15 spike: the same repositories on PostgreSQL. The schema is generated from the SQLite
// migrations by `toPostgres`, so the two never drift apart; every rewrite it needs is one of the
// SQL differences the spike is meant to find (listed in SPIKE.md).
import { AsyncLocalStorage } from 'node:async_hooks';
import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import { MIGRATIONS } from '../migrations/index.js';
import type { DB } from '../schema/tables.js';
import type { DbHandle } from '../src/handle.js';

/** The rewrites from the SQLite migrations to PostgreSQL. Each one is a finding of the spike. */
export const REWRITES: { why: string; from: RegExp; to: string }[] = [
  {
    why: 'PRAGMA is SQLite only (foreign keys are always on in PostgreSQL)',
    from: /^\s*PRAGMA[^;]*;\s*$/gim,
    to: '',
  },
  {
    why: "date(x) is SQLite's date check; PostgreSQL would use a DATE column (here: a pattern check on the ISO text)",
    from: /date\((\w+)\)\s*=\s*\1/g,
    // `$$` is a literal `$` in a replacement string (`$'` would insert the rest of the file).
    to: "$1 ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$$'",
  },
  {
    why: 'REAL is 4-byte in PostgreSQL; quantities need DOUBLE PRECISION',
    from: /\bREAL\b/g,
    to: 'DOUBLE PRECISION',
  },
  {
    why: 'COLLATE NOCASE does not exist; index lower(name) instead',
    from: /\((\w+) COLLATE NOCASE\)/g,
    to: '(lower($1))',
  },
  {
    why: 'instr and strpos take the same arguments and both return 0 when the needle is missing',
    from: /\binstr\(/g,
    to: 'strpos(',
  },
];

/**
 * SQLite `SELECT RAISE(ABORT, 'message') WHERE condition` triggers become PL/pgSQL.
 * One function per trigger, fired BEFORE the same event, returning NEW.
 */
function convertRaiseTriggers(sql: string): string {
  return sql.replace(
    /CREATE TRIGGER (\w+)\s+BEFORE (INSERT|UPDATE)(?: OF \w+)? ON (\w+)\s+BEGIN\s*([\s\S]*?)\s*END;/g,
    (full, name: string, event: string, table: string, body: string) => {
      const checks: string[] = [];
      for (const match of body.matchAll(
        /SELECT RAISE\(ABORT, '([^']*)'\)\s+WHERE\s+([\s\S]*?);/g,
      )) {
        checks.push(`  IF ${match[2]!.trim()} THEN\n    RAISE EXCEPTION '${match[1]}';\n  END IF;`);
      }
      if (!checks.length) return full;
      return [
        `CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $fn$`,
        'BEGIN',
        checks.join('\n'),
        '  RETURN NEW;',
        'END;',
        '$fn$ LANGUAGE plpgsql;',
        '',
        `CREATE TRIGGER ${name}`,
        `BEFORE ${event} ON ${table}`,
        `FOR EACH ROW EXECUTE FUNCTION ${name}();`,
      ].join('\n');
    },
  );
}

export function toPostgres(sqliteSql: string): string {
  const rewritten = REWRITES.reduce((sql, r) => sql.replace(r.from, r.to), sqliteSql);
  return convertRaiseTriggers(rewritten);
}

export class PgDb implements DbHandle {
  readonly dialect = 'postgres' as const;
  private readonly kysely: Kysely<DB>;
  private readonly tx = new AsyncLocalStorage<Transaction<DB>>();
  readonly pool: pg.Pool;

  constructor(
    url: string,
    /** Each test run gets its own schema in the throwaway database. */
    readonly schema: string,
    readonly currentUser: () => string | null = () => null,
  ) {
    this.pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
    this.kysely = new Kysely<DB>({ dialect: new PostgresDialect({ pool: this.pool }) });
  }

  get q(): Kysely<DB> {
    return this.tx.getStore() ?? this.kysely;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.tx.getStore()) return fn();
    return this.kysely.transaction().execute((trx) => this.tx.run(trx, fn));
  }

  /** Creates the schema and applies every migration (converted) in one transaction. */
  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
      await client.query(`SET LOCAL search_path = ${this.schema}`);
      for (const m of MIGRATIONS) await client.query(toPostgres(m.sql));
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.kysely.destroy();
  }
}

export async function openPostgres(url: string, schema: string): Promise<PgDb> {
  const db = new PgDb(url, schema);
  await db.migrate();
  return db;
}
