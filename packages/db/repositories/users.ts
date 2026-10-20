// Users (B2 accounts) and the audit log (A10).
import type {
  AuditEntry,
  AuditFilter,
  AuditQueryRepository,
  AuditRecord,
  AuditSink,
  UserRecord,
  UserRepository,
} from '@excise/contract';
import type { Role } from '@excise/schemas';
import { sql } from 'kysely';
import type { UsersTable } from '../schema/tables.js';
import type { DbHandle } from '../src/handle.js';
import { created, newId, now } from './common.js';

const toUser = (r: UsersTable): UserRecord => ({
  id: r.id,
  username: r.username,
  passwordHash: r.password_hash,
  role: r.role as Role,
  active: r.active === 1,
  failedAttempts: r.failed_attempts,
  mustChangePassword: r.must_change_password === 1,
});

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: DbHandle) {}

  private touch() {
    return {
      updated_at: now(),
      updated_by: this.db.currentUser(),
      version: sql<number>`version + 1`,
    };
  }

  async findByUsername(username: string) {
    const r = await this.db.q
      .selectFrom('users')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst();
    return r ? toUser(r) : null;
  }

  async getById(id: string) {
    const r = await this.db.q
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return r ? toUser(r) : null;
  }

  async create(user: Omit<UserRecord, 'id' | 'failedAttempts'>) {
    const base = created(this.db);
    await this.db.q
      .insertInto('users')
      .values({
        ...base,
        username: user.username,
        password_hash: user.passwordHash,
        role: user.role,
        active: user.active ? 1 : 0,
        failed_attempts: 0,
        must_change_password: user.mustChangePassword ? 1 : 0,
      })
      .execute();
    return (await this.getById(base.id))!;
  }

  async setFailedAttempts(id: string, count: number) {
    await this.db.q
      .updateTable('users')
      .set({ ...this.touch(), failed_attempts: count })
      .where('id', '=', id)
      .execute();
  }

  async setPasswordHash(id: string, hash: string, mustChangePassword: boolean) {
    await this.db.q
      .updateTable('users')
      .set({
        ...this.touch(),
        password_hash: hash,
        must_change_password: mustChangePassword ? 1 : 0,
      })
      .where('id', '=', id)
      .execute();
  }

  async list() {
    return (await this.db.q.selectFrom('users').selectAll().orderBy('username').execute()).map(
      toUser,
    );
  }

  async setActive(id: string, active: boolean) {
    await this.db.q
      .updateTable('users')
      .set({ ...this.touch(), active: active ? 1 : 0 })
      .where('id', '=', id)
      .execute();
  }

  async count() {
    const r = await this.db.q
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirst();
    return Number(r?.n ?? 0);
  }
}

export class SqliteAuditSink implements AuditSink {
  constructor(private readonly db: DbHandle) {}

  async record(entry: AuditEntry) {
    await this.db.q
      .insertInto('audit_log')
      .values({
        id: newId(),
        at: now(),
        user_id: entry.userId,
        action: entry.action,
        table_name: entry.table,
        row_id: entry.rowId,
        before_json:
          entry.before === null || entry.before === undefined ? null : JSON.stringify(entry.before),
        after_json:
          entry.after === null || entry.after === undefined ? null : JSON.stringify(entry.after),
      })
      .execute();
  }
}

export class SqliteAuditQueryRepository implements AuditQueryRepository {
  constructor(private readonly db: DbHandle) {}

  async search(filter: AuditFilter): Promise<AuditRecord[]> {
    let q = this.db.q
      .selectFrom('audit_log as a')
      .leftJoin('users as u', 'u.id', 'a.user_id')
      .select([
        'a.id',
        'a.at',
        'a.user_id',
        'a.action',
        'a.table_name',
        'a.row_id',
        'a.before_json',
        'a.after_json',
        'u.username',
      ]);
    if (filter.table) q = q.where('a.table_name', '=', filter.table);
    if (filter.rowId) q = q.where('a.row_id', '=', filter.rowId);
    if (filter.userId) q = q.where('a.user_id', '=', filter.userId);
    // Calendar dates against the UTC timestamp's date part, as the mocks do.
    if (filter.from) q = q.where('a.at', '>=', filter.from);
    if (filter.to) q = q.where(sql<string>`substr(a.at, 1, 10)`, '<=', filter.to);
    const rows = await q
      .orderBy('a.at', 'desc')
      // Same millisecond: SQLite keeps insertion order in rowid; PostgreSQL has none (see the spike).
      .orderBy((this.db.dialect === 'sqlite' ? 'a.rowid' : 'a.id') as never, 'desc')
      .limit(filter.limit ?? 200)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      userId: r.user_id,
      action: r.action as AuditRecord['action'],
      table: r.table_name as AuditRecord['table'],
      rowId: r.row_id,
      before: r.before_json === null ? null : JSON.parse(r.before_json),
      after: r.after_json === null ? null : JSON.parse(r.after_json),
      username: r.username ?? null,
    }));
  }
}
