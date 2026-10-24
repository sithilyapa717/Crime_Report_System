# PostgreSQL spike (A15)

**Question:** can the same repositories run on PostgreSQL for the hosted version (REWRITE_PLAN §9, Phase 9), and which SQL differs?

**Answer:** yes. The full repository contract suite (`tests/database/contract.test.ts`, the same tests that run on the mocks and on SQLite) passes on PostgreSQL 16 with the repository code unchanged. The schema is generated from the SQLite migrations by the rewrites below, and two results needed an explicit number conversion.

Run it: `pnpm db:pg-spike` (Windows, with PostgreSQL's programs in `C:\Program Files\PostgreSQL\16\bin` or `PG_BIN`). It starts a throwaway local cluster in a temp folder (trust login on localhost, no password), runs the suite, then stops and deletes the cluster. Result on 2026-10-20: **27/27 passed** (9 contract tests × mocks, SQLite, PostgreSQL).

## What differs

### Schema (handled by `toPostgres` in `pg-db.ts`)

| SQLite                                          | PostgreSQL                                                | Note                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `PRAGMA foreign_keys = ON`                      | removed                                                   | Foreign keys are always on                                                           |
| `CHECK (date(x) = x)`                           | `CHECK (x ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')`              | The spike keeps dates as ISO text. The hosted version should use real `date` columns |
| `REAL`                                          | `DOUBLE PRECISION`                                        | PostgreSQL `REAL` is 4-byte; seized quantities need 8                                |
| `(name COLLATE NOCASE)` index                   | `(lower(name))`                                           | Case-insensitive name search                                                         |
| `instr(text, needle)`                           | `strpos(text, needle)`                                    | Same argument order; both return 0 when the needle is missing                        |
| `SELECT RAISE(ABORT, 'm') WHERE c` in a trigger | PL/pgSQL `IF c THEN RAISE EXCEPTION 'm'` and `RETURN NEW` | Integrity triggers in migration 0004. Partial unique indexes stay as written         |

### Query code (changed in the repositories; works on both)

| Finding                                                             | Fix                                                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cash notes were ordered by SQLite's hidden `rowid`                  | Migration 0003 adds a `position` column; both databases order by it                                                  |
| `COUNT(...)` and `SUM(...)` come back as strings (bigint) from `pg` | `Number(...)` in `usageCount` and the report rows' fine total                                                        |
| The audit list broke ties within one millisecond with `rowid`       | PostgreSQL sorts by `id` instead (dialect check). The hosted version should add a sequence or `at` with microseconds |

### Not covered by the spike (needed for real hosting)

- **Column types:** `uuid`, `date`, `timestamptz`, `boolean` instead of text and 0/1 integers. Kysely's types and the row mappers would change in `schema/tables.ts` and `repositories/common.ts`.
- **Backups:** `VACUUM INTO` / `PRAGMA integrity_check` (`backup/database-files.ts`) are SQLite only; a server uses `pg_dump` or managed backups.
- **Concurrency:** many users at once means connection pooling (the spike uses a pool of 4), and conflict handling through `version` (already in every table) for offices that sync.
- **Migrations:** the hosted version needs its own native PostgreSQL migrations rather than the generated ones.
- **Network layer:** the Fastify API and an HTTP repository in front of the database (Phase 9) are not part of this spike.

## Files

- `pg-db.ts`: `toPostgres` (the rewrites above), `PgDb` (the `DbHandle` on a `pg` pool with the same `transaction(fn)` behaviour as SQLite), `openPostgres`.
- `../src/handle.ts`: the small interface every repository uses, so one implementation serves both databases.
- `../../../scripts/pg-spike.mjs`: the throwaway-cluster runner.
