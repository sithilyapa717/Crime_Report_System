# Services (Member B)

The rules of the app: no UI, no SQL. Screens call these through IPC (`apps/desktop/main/README.md`); they reach the database only through the repository interfaces in `packages/shared/contract`, which A implements in `packages/db`.

## What is here

| Package      | Plan item | What it does                                                                                                                                                                                                       |
| ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`       | B2        | Roles and permissions (`assertCan` in every service method), Argon2 login, lock after 5 failed attempts, change password, OIC creates and unlocks users                                                            |
| `cr`         | B3        | Create, update, find, soft delete, restore. CR number `n/year` unique per office and year; a deleted CR's number can be reused; restore within 30 days (later: OIC only)                                           |
| `case`       | B4        | Court, case number, case type, hearings, outcomes, reward voucher, register references, hand-over. Optimistic locking by `version`                                                                                 |
| `validation` | B5        | §4.3 rules: NIC format, CR number, no future detection date, hearings not before detection, no outcome without a case number                                                                                       |
| `search`     | B6        | By year, court date, detection date, court + case number, partial name, NIC; convicts register; previous-offence check                                                                                             |
| `reports`    | B7        | Scope (year / month / half-year) × person (none / detecting officer / informant) × type (the 10 old report filters); summaries per offence or officer with counts, quantities per item, `Quantity` total and fines |
| `docdata`    | B8        | All merge fields of the 92 templates as raw values (ISO dates, cents, typed text); D formats them                                                                                                                  |
| `export`     | B9        | Excel and CSV (UTF-8 with BOM, Sinhala headers from the labels file)                                                                                                                                               |
| `mocks`      | –         | In-memory repositories and sample data, so the app runs before A's database exists                                                                                                                                 |

`tests/reports-parity` (B10) has the comparison tools; the tests wait for real data.

Every create, change, delete, restore, login and user change is sent to the `AuditSink` (A's audit service). User entries never contain password hashes.

## For the other members

- **A:** implement the repository interfaces and `AuditSink` in `packages/shared/contract`. Note the rules in the comments: `findByNumber` returns only the live CR; `setDeleted` bumps `version` and `updatedAt`; `rowsFor` and the query repository exclude deleted CRs. Then replace `createDevRepositories()` in `apps/desktop/main/src/main.ts`.
- **C:** call services with `window.excise.call(channel, ...args)`; check `ok`; show `error.issues` on the form fields; captions come from `@excise/labels`.
- **D:** `docdata.buildFor(crId)` returns raw values; formatting lives in `packages/documents/mapping`.

## Decisions waiting for the department

These are coded as below and easy to change once answered (REWRITE_PLAN.md §10):

| Question                                     | Current behaviour                                                      | Where                              |
| -------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| Half-year rule (Q6)                          | Uses the half chosen at entry (`halfYear`)                             | `reports`, `mocks` / A's `rowsFor` |
| Must the CR month equal the detection month? | Not enforced                                                           | `validation`                       |
| What counts as "resolved" (විසදුනු)          | Has an outcome, or withdrawn, or accused died                          | `reports/TYPE_FILTERS`             |
| Several outcomes per accused (Q2)            | Allowed; a person is in the convicts register if any outcome is marked | `case`, `reports`                  |
| Lockout                                      | 5 failed attempts; the OIC unlocks                                     | `auth`                             |
| Restore window                               | 30 days; after that the OIC only                                       | `cr/RESTORE_WINDOW_DAYS`           |

## Still open

- Report parity against the old Access reports: needs real data (B10).
- Sinhala captions marked `si: null` in `packages/shared/labels`: need `docs/LEGACY_SCREEN_INVENTORY.md`.
- Ticking off all 116 old queries: needs `docs/LEGACY_QUERY_CATALOG.md`.
- Contract and labels approval from A, C and D.
