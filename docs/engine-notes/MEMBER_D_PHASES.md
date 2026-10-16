# Member D – Phase plan (Documents, print layouts, guides)

Companion to `REWRITE_PLAN.md` (§6, §1.7) and `TEAM_WORK_SPLIT.md` (D1–D12).

**Owned folders:** `packages/documents/*`, `apps/desktop/renderer/documents-dialog/`, `tests/documents-fidelity/`, `docs/document-catalogue/`, `docs/user-guide/`, `docs/admin-guide/`, `docs/engine-notes/`.

**Rule for every phase:** the app never retypes, reformats or "improves" a template. It only replaces merge fields.

---

## Phase 0 – Freeze the originals (D1 start)

- Copy every `.docx` from `Word Document edit/` into `packages/documents/templates/original/`, keeping the folder structure. Skip `~$` lock files and the empty `New Microsoft Word Document.docx`.
- Check in a SHA-256 manifest of each file, plus a verify script that fails if any original changes.

**Done when:** the originals are frozen and verify passes.

## Phase 1 – Inventory and field catalogue (D1, D2)

- Write a script that lists, for every template: its merge fields (simple and complex), any `SELECT … WHERE Offence=` data-source query, and the fonts used.
- Produce a draft catalogue: file → folder/offence → variant (can/bottle, 180/375/750 ml, Rs 500/1000, 2–4 offences) → fields → current? (left blank until staff decide).
- Send B the union of all fields. It becomes the B8 document-data contract.

**Blocked by:** §10 Q3 (which templates are current), for the "current?" column only.

## Phase 2 – Template engine core (D3, D4)

- `pizzip` + an XML parser.
- Handles `w:fldSimple` and complex `w:fldChar` begin/separate/end fields, fields split across runs, tables, headers and footers.
- Replaces only the result text, and removes the `mailMerge` data-source link from `settings.xml`, in the generated copy only.
- Formatters for date `YYYY.MM.DD`, money and times.
- Uses sample data until B8 is ready.

## Phase 3 – Fidelity tests (D7), built alongside Phase 2

- For each template, generate a document and check that the text outside merge fields equals the original's.
- Store a hash of the fixed text for each template; a change fails the build.
- Where possible, compare against a Word-merged reference for 2–3 real CRs.

## Phase 4 – Registry, generation and logging (D5, D6)

- Registry: offence code → templates + variants, using A's `document_templates` table.
- Output file named with the CR number.
- `generated_documents` log: who, what, when.
- Regenerating never silently overwrites a file.
- Optional PDF export through Word.

**Needs:** A's table and B8 (mocks until then).

## Phase 5 – All document families (D8)

Done in risk order:

1. Plaints and charge sheets by offence.
2. REWARDS vouchers.
3. Warrant documents: motion sheets, previous-record notes, warrant extension.
4. Cigarette and beedi templates (GOLD LEAF, PUMB, UPS, UCG).

## Phase 6 – Print layouts and documents dialog (D9, D10)

- Convicts list.
- Previous-conviction certificate (සුරාබදු ඊ 48), with its fixed wording and the reference text `( N 4* S & E.) 7/64`.
- Register print layouts.
- "ලේඛන සාදන්න" dialog, built with C's components.

**Needs:** C's design system.

## Phase 7 – Documentation (D11, D12)

- Document catalogue in Sinhala and English, including how to add or replace a template safely.
- Staff user guide (Sinhala).
- Admin guide: install, fonts, backup and restore.
- Engine developer notes.
- Staff sign-off.

---

## Status

### Phase 0: done

- 92 templates are frozen in `packages/documents/templates/original/`, read-only, with SHA-256 hashes in `MANIFEST.json`.
- 28 files were excluded: 21 `~$` lock files, the empty `New Microsoft Word Document.docx`, 2 PDFs and 5 PNG screenshots. The excluded list is in the manifest.
- Check: `node packages/documents/scripts/verify-originals.ts`

### Phase 1: draft inventory done; staff and B steps open

- `node packages/documents/scripts/inventory-templates.ts` regenerates three files:
  - `docs/document-catalogue/TEMPLATE_INVENTORY.md`
  - `docs/document-catalogue/MERGE_FIELDS.md`
  - `packages/documents/registry/template-inventory.json`

Findings:

- **60 distinct merge fields.** Several are not in REWRITE_PLAN §1.7:
  - Spelling or case variants of the same field: `name_of_Suerty`/`Name_of_Suerty`, `Date_of_court`, `Name_of_court`, `Detection_Officer`, `CR_NO_2015`.
  - Fields from a different data source (`Table1`): `Accused_Name`, `Accused_Address`, `Courts_Date`, `CR_No`, `Detection_Date`, `Quantity_Full`.
  - Extra fields: `Cash2_1000`, `Cash3_500`, `Cash_Number_1`, `infor_help`, `sp5`, `Production2`.
  - A field with a Sinhala name: `ග්රහණ_නිළධාරි`.
  - The field mapping (D4) must therefore support aliases and ignore case.
- **No fields in headers or footers, and no `IF`/`NEXT` field codes.** This makes the engine simpler.
- **7 templates have no merge fields at all.** They are blank or static forms: the motion sheets, the warrant extension, the previous-offence report, `460, 461 PDFC`, `aaaaaaaaaaaaaa`, `PUMB 2021.02.11/PUMB`, and `හිස් සාක්ෂි භාණ්ඩ රැගෙන ඒම`. They can be printed as they are.
- **Data sources stored in the files:**
  - 65 use `SELECT * FROM Office`.
  - 8 use the `Plaint Charge Sheet` query, 2 of them filtered (`Offence = 'PUDS'`, `'UPT'`).
  - 1 uses `Table1`.
- **Fonts: high risk for Phase 2.** Many templates mix the Unicode font Iskoola Pota with legacy ASCII-mapped Sinhala fonts (FMAbhaya, DL-Manel, 0KDOLU, AA Amali, Bandula …).
  - In 47 templates, at least one merge-result run carries a legacy font in `ascii` or `cs`.
  - The engine must keep each run's formatting, and the fidelity tests must check that Unicode Sinhala values render through the run's `cs` font.
  - Digits and Latin text in those runs need a visual check too.
  - The admin guide must list these fonts for installation (§10 Q4).
- **No two templates are byte-identical**, so staff must still choose current versions by name. The inventory marks likely copies.

### Phase 2: engine core done

**Engine** (`packages/documents/engine/`):

- `fillTemplate(templateBuffer, data, options)` returns `{ docx, report }`.
- Fills `fldSimple` fields and complex `fldChar` fields, including instructions split over several runs and fields that have no result part.
- Like a Word merge, a filled field becomes plain runs. The formatting (`rPr`) of the field's result run is kept.
- Removes `<w:mailMerge>` and its `mailMergeSource` relationships from the generated copy only, so Word no longer asks for the old `.accdb`.
- Edits are made on the XML text, never through a DOM, and any ZIP entry that is not changed is written back with its original compressed bytes.
- No npm dependency: a small ZIP reader and writer built on `node:zlib` replaces `pizzip`. Byte-for-byte copying of untouched parts is a stronger fidelity guarantee than repacking every part.

**Mapping** (`packages/documents/mapping/`):

- 53 canonical fields cover all 60 template field names. Matching ignores case, and aliases are marked `confirmed: false` until staff and B agree them.
- Formatters:
  - date `YYYY.MM.DD`
  - time `HH.MM` (to confirm)
  - money from integer cents, printed without grouping (to confirm)
- `sample-data.ts` holds a made-up CR until B8 exists.

**Checks:**

- `node --test "packages/documents/**/*.test.ts"`: 17 unit tests pass.
- `node packages/documents/scripts/fill-sample.ts <out dir>`: fills all 92 templates, with 0 failures.
- A one-off check over all 92 templates passed for each one:
  - the visible text outside the fields is unchanged;
  - no `MERGEFIELD` is left;
  - the Access link is removed;
  - every untouched ZIP entry is byte-identical.
  - Phase 3 turns this into the permanent fidelity test.
- Visual check through Word (PDF export) of two filled templates (PUDS bottle, USFL bottle): the Unicode Sinhala values render correctly. The legacy-font risk is lower than feared.
  - This PC does not have Iskoola Pota or the FM/DL fonts installed, so the check must be repeated on a department PC.

**Questions found:**

- In `USFL/usfl new බෝතලය`, `Quantity1` and `Quantity` are side by side with no text between them. Sample values 180 and 750 print as "180750". What `Quantity1` means must be confirmed (bottle size?).
- `Cash_Number` and `Cash_Number_1`: are they note serial numbers or note counts?

### Phase 3: fidelity tests done

Everything lives in `tests/documents-fidelity/` and runs in CI's Documents job.

- **`fidelity.test.ts`**, one test per template (92). It fills the template with marker values, giving each text field its own `⟦marker⟧`, then checks:
  - the output text equals the original wording with each field replaced by its expected value in the same place;
  - every field is mapped, and none is left behind;
  - the XML is well-formed;
  - the Access link is gone;
  - every untouched part is byte-identical.
- **`fixed-text.test.ts`**, the wording snapshot. Each template's fixed text is stored as a readable `.txt` in `fixed-text/`, which is easier to review than a hash: a deliberate template change requires `approve-fixed-text.ts`, and the PR then shows the wording change as a diff.
- **`fidelity-lib.ts`** reads Word XML independently of the engine, so the tests don't judge the engine with its own code.
- **Mutation check.** Three kinds of tampering were tried: an altered Sinhala word, two swapped values and a dropped value. All are caught, and broken XML is caught by the well-formedness check.
- **Comparison with Word's own merge.** `compare-with-word.ts` + `word-merge.ps1` is a Windows-only tool that needs Word and is not run in CI. Word mail-merges the same values into every template that has fields, and the visible text is compared with the engine's. Results are in `WORD_COMPARISON.md`.
  - **Result: 85 of 85 templates are identical to Word's merge.** The other 7 templates have no fields.
  - The first run found 2 differences. Both turned out to be a bug in the test reader, which didn't count Word's short form `<w:p/>` as a paragraph; the engine was correct.
- **Still open:** comparing against documents Word merged from **real Access data**. This needs the real `.accdb` data (§10 Q1).

### Phase 4: registry, generation and logging done (against a mock of A's table)

**Registry** (`packages/documents/registry/`):

- `templates.json` has one entry per frozen template, holding its family, offence codes, variant and status. It was seeded from folder and file names by `scripts/seed-registry.ts` and is maintained by hand from now on.
  - Every entry starts as `unconfirmed`. Staff set `current` or `archived` (§10 Q3).
  - Variants read from the names: can or bottle, sample or no sample, 180/375/750 ml, Rs 500/1000 (only when `රු` is written), 2–4 offences.
  - Things to confirm are written in `notes`: GOLD LEAF offence codes, whether a bare "500"/"1000" means a note value or a volume, and file names that look like copies.
- `TemplateRegistry.forOffence(code)` gives the templates the dialog offers:
  - archived templates are never offered;
  - current templates come first, then templates for this offence, then general ones.
  - An empty offence list means "any offence" only for general documents (vouchers, motion sheets and similar). A plaint without an offence code isn't offered at all, so the 12 cigarette/beedi plaints wait for staff to set their codes.
- `TemplateSource` is the interface A's `document_templates` table implements later. `JsonTemplateSource` is the stand-in until then.

**Generation** (`packages/documents/generation/`):

- `DocumentGenerator.generate()` takes the CR, the template and the field strings, which are exactly what `DocDataService.buildFor` (B8) returns.
- It refuses:
  - archived templates;
  - templates for a different offence, unless `allowOtherOffence` is set, in which case it warns;
  - template files that no longer match `MANIFEST.json`.
- Output file names look like `CR 12-2026 - <template title>.docx` and are Windows-safe. A file is never overwritten: a regenerated document is saved as ` (2)`, ` (3)` and so on.
- The log records who, what, when, the template hash, the output hash and which fields were left empty.
  - `InMemoryGenerationLog` and `JsonLinesGenerationLog` stand in until A's `generated_documents` table exists.
- Optional PDF export through Word (`exportPdfWithWord`, Windows only). If the PDF fails, the `.docx` is kept and a warning is shown.

**Engine:** `fillTemplateFromFields()` fills from ready-made strings. It tries the exact field name first, then falls back to case-insensitive and alias matches.

**Checks:**

- 215 tests pass: 30 in the documents package, plus 185 fidelity tests.
- A real run on the dev PC produced the CR-named `.docx`, the PDF through Word, and a log line.

**To agree with B:**

- Who formats values. `@excise/docdata` already formats them, so `formatMoney` gives `1,500.50` and times are passed through as `14:45`. D4's formatters give `1500` and `14.45`. Both are guesses until a real Word-merged document is checked.
- My proposal: B returns raw values, and D's mapping does the formatting in one place.

### Phase 5: family audit and staff review tools done; the family sign-off waits for staff

The engine already handles every family the same way, and the fidelity tests and the Word comparison cover all 92 templates. What is left per family is staff decisions, so this phase builds the tools that collect them.

**Family audit:** `scripts/family-audit.ts` writes `docs/document-catalogue/FAMILIES.md`. For each family it lists the templates, offences, variants, the fields used, and whether B8 supplies each field.

- B8 supplies every field the templates use. The one exception is `type`, which B returns empty on purpose until its meaning is agreed. It is used only in UMA.
- 13 plaints have no offence code, so they are not offered: 12 cigarette/beedi templates in GOLD LEAF, plus `aaaaaaaaaaaaaa`.
- 7 templates have no fields. They are blank or static forms and are printed as they are.

**Staff review pack:** `scripts/review-pack.ts <dir> [--pdf]` produces:

- every template filled with the made-up sample CR, as `.docx` and, with `--pdf`, as a PDF made through Word in one session (`pdf-batch.ps1`);
- `index.html`, a printable overview by family with instructions, the general questions and per-template questions;
- `review-sheet.csv`, opened in Excel. Staff mark each template `current` / `old copy`, correct the offence codes, and add comments.

**Applying the answers:** `scripts/apply-review.ts <sheet.csv> [--dry-run]` updates `registry/templates.json`.

- It accepts sheets separated by commas or semicolons, and requires UTF-8 (it explains how to save as "CSV UTF-8").
- If any row is wrong (unknown template, unclear decision, bad offence code), nothing is applied.
- Logic lives in `registry/review.ts`, with 6 tests.

**Still waiting on staff:** the filled review sheet, plus answers to the general questions (`Quantity1`, `Cash_Number`, money and time formats, the cigarette offence codes, fonts).

### Phase 6: print layouts and dialog service done; the dialog screen waits for C's renderer

**Print layouts** (`packages/documents/print-layouts/`) return HTML that Electron prints with Chromium.

- `renderCertificateE48`: the certificate of previous conviction, with the same fields, order and wording as the old report (§98), one per page.
- `renderConvictsList`: the monthly convicts list.
  - Title and columns follow the old report (§97), landscape.
  - Sentences are tick columns.
  - Without a month, it uses the register screen's title (§56).
- `renderRegister`: any `ReportService` result.
  - Captions come from the labels file.
  - Dates print as `YYYY.MM.DD` and money from cents.
  - The fine total goes under the fine column.
- All fixed wording is in `wording.ts`, copied from LEGACY_SCREEN_INVENTORY.md. A test checks every string against that file when it is present (locally; skipped in CI).
- Visual check through headless Edge (same engine as Electron): the header row repeats on every page, and Sinhala renders correctly. One defect was fixed: the longest vertical caption was being cut off.

**Dialog service** (`packages/documents/dialog/`):

- `DocumentsService.listFor / generate / history` is what the documents dialog needs. It takes the CR number and offence from B8's data, uses the session user for the log, and returns warning codes instead of wording.

**Package:** `packages/documents/package.json` (`@excise/documents`) with a single entry point, `index.ts`.

**Integration requests:** see `docs/engine-notes/INTEGRATION.md`.

- B: add the package to the workspace, add the IPC channels, add printing.
- B, C and D together: the dialog labels.

**Waiting:** the React dialog screen (D10) needs C's renderer and design system, which are still empty on `main`.

### Phase 7: documentation done; staff sign-off open

**Documents:**

- `docs/document-catalogue/CATALOGUE.md`, generated by `scripts/catalogue.ts`. Bilingual headings, covering:
  - how the app uses the templates;
  - every template by family, with offence, variant and status;
  - all 53 data fields with their other names, meaning and print format;
  - the fonts;
  - the procedure for adding or replacing a template.
- `docs/admin-guide/DOCUMENTS_ADMIN.md`: fonts, file locations (proposed), backup, integrity check, the staff review loop, PDF export and troubleshooting.
- `docs/user-guide/DOCUMENTS_SI.md`: staff guide in Sinhala, covering generating, file names and copies, warnings, missing templates, printouts and template changes.
- `docs/engine-notes/ENGINE.md`: developer notes on the layout, how filling works, field names, what each test proves, quirks and the tools.

**Tools:**

- `scripts/add-template.ts` (`registry/template-admin.ts`, 4 tests) adds a template or a new version safely. It uses a new file name, makes the copy read-only, writes the manifest and registry entries, and archives the old version. It refuses: non-Word files, existing names, paths outside the folder, and fields the mapping doesn't know.
- `scripts/check-fonts.ts` lists the fonts the templates use and which are missing on the PC. On the dev PC, 22 are missing, including Iskoola Pota.

**Refactor:**

- `registry/infer.ts`: the name-reading rules, shared by the seed script and add-template. Re-seeding gives a byte-identical registry.
- `registry/families.ts`: one family order and title list.

**Open:**

- Staff sign-off of the Sinhala guide and the catalogue. The Sinhala text needs a native-speaker review.
- The user guide's button names, once the dialog screen exists.
- File locations, once B wires the app.

## Notes to raise with the team

- **The real folders differ from REWRITE_PLAN §1.7.** There are no `UPA` or `UPFL` folders: those templates live in `USA-UPA/`. There is an extra `PUMB 2021.02.11/` folder (7 files), and `GOLD LEAF/` has 15 files. The catalogue follows the real folders.
- **Fonts (§10 Q4).** Phase 1's inventory lists the fonts each template uses, straight from the `.docx` files.
- **Tooling.** The pnpm workspace and root config are B's. Until they exist, Member D's scripts are TypeScript run directly with Node 24 (`node script.ts`, built-in type stripping) and have no npm dependencies.
