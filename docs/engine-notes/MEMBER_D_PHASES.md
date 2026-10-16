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

## Notes to raise with the team

- **The real folders differ from REWRITE_PLAN §1.7.** There are no `UPA` or `UPFL` folders: those templates live in `USA-UPA/`. There is an extra `PUMB 2021.02.11/` folder (7 files), and `GOLD LEAF/` has 15 files. The catalogue follows the real folders.
- **Fonts (§10 Q4).** Phase 1's inventory lists the fonts each template uses, straight from the `.docx` files.
- **Tooling.** The pnpm workspace and root config are B's. Until they exist, Member D's scripts are TypeScript run directly with Node 24 (`node script.ts`, built-in type stripping) and have no npm dependencies.
