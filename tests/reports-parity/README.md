# Report parity tests (B10)

Goal: every report the new app produces matches the old Access report for the same data (TEAM_WORK_SPLIT.md, B10; REWRITE_PLAN.md §7 step 3).

**Status: waiting for real data.** The supplied `.accdb` has one sample row, so there is nothing to compare yet. The tools are ready and tested (`compare.ts`).

## When data arrives

1. A imports the full Access copy with the importer (A13) into a SQLite file.
2. In Access, run each old report and export it to CSV (External Data → Text File, with field names). Save them here as `cases/<name>/access.csv`. Start with:
   - Yearly register (`Search year`), monthly and half-year registers
   - Warrant, trial, summons, not filed, fines not collected, rewards due, resolved, fines earned
   - The same reports by detecting officer and by informant
   - Convicts register
3. Next to each CSV, add `case.json` with the report parameters and how the old columns map to the new ones:

   ```json
   {
     "params": {
       "scope": { "kind": "year", "officeId": "<id>", "year": 2025 },
       "person": { "kind": "none" },
       "type": "register"
     },
     "key": "CR NO 2017",
     "columns": {
       "CR NO 2017": "crNumber",
       "Name of Accused": "accusedName",
       "Case no": "caseNumber"
     }
   }
   ```

4. A test then runs `reports.run(params)` on the imported database and calls `compareReports()`. Any missing row, extra row or different value fails the test.

Notes:

- Fines: Access stored whole rupees; the engine returns cents. Divide by 100 before comparing.
- The old registers have a known label mix-up (REWRITE_PLAN.md §1.9 item 8): the column titled "T/R" holds `WT` and the one titled "වරෙන්තු" holds `T/R`. Map them by field, not by title.
- "Resolved" (විසදුනු) has no single old query; agree its definition with staff before comparing.
