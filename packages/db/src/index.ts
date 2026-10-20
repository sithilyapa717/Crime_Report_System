// @excise/db: SQLite repositories behind the contract (packages/shared/contract).
import { ExciseDb, openDatabase, type OpenOptions } from './connection.js';
import { SqliteCaseRepository } from '../repositories/cases.js';
import { SqliteCrRepository } from '../repositories/crime-reports.js';
import {
  SqliteFileRepository,
  SqliteGenerationLog,
  SqliteTemplateSource,
} from '../repositories/files.js';
import { SqliteCrQueryRepository, SqliteReportRowRepository } from '../repositories/queries.js';
import { SqliteReferenceLookup, SqliteReferenceRepository } from '../repositories/reference.js';
import {
  SqliteAuditQueryRepository,
  SqliteAuditSink,
  SqliteUserRepository,
} from '../repositories/users.js';
import { sqliteDatabaseFiles } from '../backup/database-files.js';

export { ExciseDb, openDatabase, type OpenOptions };
export { sqliteDatabaseFiles, type DatabaseFiles } from '../backup/database-files.js';
export { seedDemo, type DemoRefs } from '../seed/demo.js';
export type { DB } from '../schema/tables.js';

/** Every repository the service host needs, plus D's registry/log and the backup steps. */
export function createSqliteRepositories(db: ExciseDb) {
  const references = new SqliteReferenceRepository(db);
  return {
    db,
    crs: new SqliteCrRepository(db),
    cases: new SqliteCaseRepository(db),
    queries: new SqliteCrQueryRepository(db),
    reportRows: new SqliteReportRowRepository(db),
    users: new SqliteUserRepository(db),
    refs: new SqliteReferenceLookup(references),
    audit: new SqliteAuditSink(db),
    references,
    auditQuery: new SqliteAuditQueryRepository(db),
    files: new SqliteFileRepository(db),
    templates: new SqliteTemplateSource(db),
    generationLog: new SqliteGenerationLog(db),
    databaseFiles: sqliteDatabaseFiles(db),
    transaction: <T>(fn: () => Promise<T>) => db.transaction(fn),
  };
}

export type SqliteRepositories = ReturnType<typeof createSqliteRepositories>;
