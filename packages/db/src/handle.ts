// What a repository needs from the database: a query builder (the current transaction's inside
// `transaction`), transactions, the user for `updated_by`, and which SQL dialect is underneath.
// SQLite (ExciseDb) is the app's; PostgreSQL is the hosting spike (postgres-spike/).
import type { Kysely } from 'kysely';
import type { DB } from '../schema/tables.js';

export interface DbHandle {
  readonly dialect: 'sqlite' | 'postgres';
  readonly q: Kysely<DB>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  readonly currentUser: () => string | null;
}
