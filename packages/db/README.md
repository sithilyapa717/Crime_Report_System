# Database (`@excise/db`)

SQLite through better-sqlite3 and Kysely. Implements every repository in `packages/shared/contract`, D's `TemplateSource` and `GenerationLog`, and the database steps of backups. Design: [docs/database-design/DATABASE.md](../../docs/database-design/DATABASE.md).

```ts
import { createSqliteRepositories, openDatabase } from '@excise/db';

const repos = createSqliteRepositories(openDatabase(file, { currentUser: () => sessionUserId }));
await repos.transaction(async () => {
  /* every repository call here is one transaction */
});
```

| Folder          | What                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `migrations/`   | plain-SQL schema and views, embedded through `migrations/index.ts`      |
| `schema/`       | Kysely table types (keep in step with the SQL)                          |
| `repositories/` | the contract implementations                                            |
| `backup/`       | `VACUUM INTO` snapshot, integrity check, replace-and-reopen for restore |
| `seed/`         | `seedDemo(db, n)`: fake data for development and the load test          |
| `src/`          | connection, migrator, transactions                                      |

The app opens `<userData>/excise.sqlite` (WAL mode, foreign keys on). `EXCISE_MOCK=1` runs the app on the in-memory mocks instead.

## Tests

- `tests/database/contract.test.ts`: the repository contract, run against both the mocks and SQLite.
- `tests/database/sqlite.test.ts`: rollback, database constraints, `updated_by`, backup and restore of a real file, demo seed.
- `apps/desktop/main/src/host*.test.ts`: every IPC channel through all services, on both backends.
- `pnpm db:load-test [count]`: 100,000 CRs, every search and report timed (limit 1 s).

better-sqlite3 13 ships N-API binaries, so the same build loads in Node (tests) and Electron 44 (app): no native rebuild.
