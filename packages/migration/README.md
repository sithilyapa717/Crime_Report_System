# Access importer (A13 / A14)

One-time import of the legacy `Excise Department 2021.accdb` into the new system (REWRITE_PLAN §7, §11).

## How it works

1. **Read.** `src/reader/read-accdb.ps1` copies nothing itself: the importer first copies the `.accdb` into a work folder and opens only the copy, read-only, with DAO. It writes every user table and every attachment (pictures) to JSON and files. Needs Windows and the 64-bit Microsoft Access Database Engine (ACE). The original file is never opened.
2. **Map.** `src/columns.ts` lists every legacy `Office` column and where it goes. The report lists columns found in the file but **not** in this list (`unmapped`: their data is not imported) and columns in the list but not in the file (`missing`). Fix spellings there when the real file differs.
3. **Transform.** `src/transform.ts` turns each row into a CR and its case:
   - text dates `2026.01.02`, `2026-1-2`, `2026/01/02` and real Access dates are read; a day-first date that could be read two ways (`02.03.2026`) is **not** guessed;
   - money (`result`) becomes cents; Yes/No flags, NICs, months (number, English or Sinhala name) and the half-year (`fistsecon`) are parsed;
   - a value that cannot be read goes to the **exceptions report**, and its raw text is kept in the CR's notes under "[import] values that could not be read", so nothing is lost;
   - a row without a CR number, office, offence, month, half-year, detection date or accused name is skipped and listed.
4. **Resolve names.** Lookup tables (`Table office`, `Table offence`, …) seed the reference lists as active items; offences match by code. Any other name (officers typed into the CR, unknown courts) becomes an **unverified** item: inactive, listed in the report for the OIC to check and rename or merge.
5. **Save** (real run only). CRs, cases (court, type, hearings, outcomes, register references, hand-over), pictures into the file store. A CR number that already exists for that office and year is reported as a duplicate and not imported again, so a run can be repeated after fixing the Access copy.

Passwords (`login*` tables) are never migrated. New accounts are created in the app.

## Runbook (Phase 6)

1. Get a full copy of the `.accdb` (open question Q1). Work on a copy on a PC with the Access Database Engine.
2. From the old Access reports, write down the totals into `expected-totals.json` (only what you have):

   ```json
   {
     "crsByYear": { "2024": 512, "2025": 498 },
     "finesByYearRupees": { "2024": 1250000, "2025": 1180500 },
     "quantityByOffence": { "PUDS": 18450, "UPG": 2300 }
   }
   ```

3. Dry run from the command line (nothing is saved anywhere):

   ```bash
   pnpm import:dry-run "D:\copy\Excise Department 2021.accdb" "D:\copy\expected-totals.json"
   ```

   It writes `import-report.json` and `import-report.csv` next to `expected-totals.json` and prints the totals that do not match.

4. Review `import-report.csv` with staff: fix the values in the **Access copy** (or add the column spelling to `src/columns.ts`), and repeat step 3 until the exceptions are understood and the totals match.
5. In the app, as the OIC: **Import from Access** → dry run (the same checks), then **Import**. Take a backup first.
6. After the import: review the unverified names in the reference-list editor; keep the `.accdb` read-only as the archive.

## Tests

- `src/*.test.ts`: parsers, transform and importer on synthetic legacy rows.
- `tests/migration/access-reader.test.ts`: builds a real `.accdb` (Sinhala text, dates, Yes/No, currency, an attachment) with `fixtures/make-accdb.ps1`, then reads and imports it. Runs on Windows with the Access engine; skipped elsewhere.

## Open points

- Column names are taken from REWRITE_PLAN §11 and the merge fields; check `unmapped` / `missing` on the real file.
- No field yet for `Bottle type`, `casenyear`, `casenmonth` (reported as "not stored" with counts).
- Officer names embedded in the old `Result` form's drop-downs (§1.9 item 7) are not read: that needs Access itself, not the database engine.
- A real run is all-or-nothing only when the database layer passes a `transaction` (packages/db).
