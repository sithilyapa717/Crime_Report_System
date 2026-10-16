# Document engine – developer notes

For whoever maintains `packages/documents`. The phase history is in `MEMBER_D_PHASES.md`, and wiring into the app is in `INTEGRATION.md`.

## The rule

The app never retypes, reformats or "improves" a template. It only replaces merge fields (REWRITE_PLAN §6). Every design choice below follows from that.

## Layout

```
packages/documents/
  engine/         zip.ts (ZIP read/write), fields.ts (find and replace merge fields), fill.ts (fillTemplate*), xml.ts
  mapping/        fields.ts (canonical fields, aliases, kinds), format.ts (old formats), sample-data.ts (made-up CR)
  registry/       registry.ts, templates.json, infer.ts, families.ts, review.ts, template-admin.ts
  generation/     generate.ts (DocumentGenerator), log.ts, filename.ts, pdf.ts (+ docx-to-pdf.ps1)
  print-layouts/  certificate-e48.ts, convicts-list.ts, register.ts, page.ts, wording.ts
  dialog/         documents-service.ts (what the dialog calls over IPC)
  scripts/        command-line tools (see the end of this page)
  templates/original/   the frozen Word files + MANIFEST.json (read-only)
tests/documents-fidelity/  fidelity tests, wording snapshots, Word-comparison helpers
```

There are no npm dependencies. Everything runs on Node 24 with built-in TypeScript type stripping, so the code avoids `enum`, parameter properties and other syntax that needs a compiler. Tests use `node:test`.

## How a document is filled

1. **ZIP** (`engine/zip.ts`). Every entry keeps its original compressed bytes unless it is replaced. Only `word/document.xml`, headers and footers (when they contain fields), `word/settings.xml` and `word/_rels/settings.xml.rels` are re-deflated, so untouched parts are byte-identical to the template.
2. **Fields** (`engine/fields.ts`). Edits work on the XML as text, never through a DOM, because re-serialising would change bytes outside the fields.
   - **Simple fields:** `<w:fldSimple w:instr=" MERGEFIELD x ">runs</w:fldSimple>`. The wrapper is removed and the runs are kept.
   - **Complex fields:** run(`fldChar begin`) run(`instrText`)… [run(`separate`) result runs…] run(`end`). The instruction can be split over several `instrText` runs, and `separate` plus the result can be missing.
   - **Filling:** like a Word mail merge, the field becomes plain runs. The first result run keeps its `rPr` and gets the value; other result runs are removed. A field with no result gets a new run with the instruction run's `rPr`.
   - **Nested fields:** a MERGEFIELD inside another field (`IF`…) is left untouched and reported as unsupported. None of the 92 templates have one.
   - **Duplicate content:** text boxes appear twice, in `mc:AlternateContent` Choice and Fallback. Both are filled.
3. **Access link** (`fill.ts → removeMailMergeLink`). Removes `<w:mailMerge>` and its `mailMergeSource` relationships, so Word doesn't ask for the old `.accdb`. This happens in the generated copy only.
4. **Values.** There are two entry points:
   - `fillTemplate(template, data)` takes raw values by canonical field name, and `mapping/format.ts` formats them.
   - `fillTemplateFromFields(template, fields)` takes ready-made strings by merge-field name (B8's `DocDataService` output). It tries the exact name first, then falls back to any key that maps to the same canonical field. An empty string counts as missing.

## Field names

`mapping/fields.ts` has one entry per canonical field: the old Access column name with spaces turned into underscores. Matching ignores case, and older spellings are listed as aliases (`confirmed: false` until staff agree). A template using a field that isn't in the mapping fails, both in `fillTemplate` and in `add-template.ts`, so it never prints empty without anyone noticing.

## Tests and what they prove

| Test | Proves |
|---|---|
| `engine/*.test.ts` | field handling cases, ZIP round trip, formats |
| `tests/documents-fidelity/fidelity.test.ts` | for **every** template: output text = original wording with each field replaced in place; valid XML; Access link gone; untouched parts byte-identical |
| `tests/documents-fidelity/fixed-text.test.ts` | every template's wording equals its approved `.txt` snapshot |
| `registry/*.test.ts`, `generation/*.test.ts`, `dialog/*.test.ts` | registry rules, review sheet, add-template, generation (no overwrite, refusals, log, PDF), dialog service |
| `print-layouts/*.test.ts` | wording copied from the old screens (checked against `LEGACY_SCREEN_INVENTORY.md` when it is present), formats, ticks, escaping |
| `scripts/compare-with-word.ts` (manual, Windows + Word) | engine output = Word's own mail merge: 85 of 85 templates with fields |

`fidelity-lib.ts` reads XML independently of the engine. Don't make the fidelity tests call engine internals.

Line endings: Git may check `.txt` snapshots out with CRLF on Windows. The snapshot test normalises them to LF before comparing.

## Known quirks

- Word writes an empty paragraph as `<w:p/>` when it saves. Text readers must count it as a paragraph end. This was the cause of the only differences in the first Word comparison.
- PowerShell 5's `ConvertFrom-Json` rejects keys that differ only in case (`name_of_Suerty` / `Name_of_Suerty`), so data sent to PowerShell is a list, not an object.
- Some templates use Sinhala text in runs whose `ascii` font is an old non-Unicode font. Word renders Unicode Sinhala through the run's complex-script font, so values come out correctly; this was checked visually.

## Command-line tools

| Script | Use |
|---|---|
| `scripts/verify-originals.ts` | templates unchanged (CI) |
| `scripts/inventory-templates.ts` | regenerate the inventory files (CI checks they are up to date) |
| `scripts/fill-sample.ts <dir> [template]` | fill templates with the sample CR |
| `scripts/compare-with-word.ts <dir> [filter]` | compare with Word's mail merge |
| `scripts/family-audit.ts`, `scripts/catalogue.ts` | regenerate `FAMILIES.md` and `CATALOGUE.md` |
| `scripts/review-pack.ts <dir> [--pdf]`, `scripts/apply-review.ts <csv> [--dry-run]` | staff review of the templates |
| `scripts/add-template.ts` | add a template or a new version safely |
| `scripts/check-fonts.ts` | fonts missing on this PC |
| `tests/documents-fidelity/approve-fixed-text.ts` | approve new wording snapshots after a deliberate template change |
| `scripts/freeze-originals.ts`, `scripts/seed-registry.ts` | one-time set-up; both refuse to run again |
