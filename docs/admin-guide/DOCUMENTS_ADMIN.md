# Admin guide – court documents and printouts

For the person who installs and looks after the app in an office. This page covers documents only. Installing the app itself, and backing up the database, are in A's admin guide.

> **Draft.** Folder locations marked *(proposed)* are what `docs/engine-notes/INTEGRATION.md` asks B to use; update them here once the app is wired.

## What the app needs on each PC

| Item | Needed for | Required? |
|---|---|---|
| The Sinhala fonts the templates use | documents that look like the old ones | yes, on every PC that prints |
| Microsoft Word | opening generated `.docx` files; the optional PDF export | Word or another `.docx` viewer to open files; Word only for PDF |
| Access and ODBC | – | **no**: the app fills the templates itself |

## Fonts

The templates use Unicode Sinhala text, plus a number of older Sinhala fonts for some runs. If a font is missing, Word shows that text in another font. The wording stays the same, but the printout can look different from the old one.

1. Check a PC:
   ```
   node packages/documents/scripts/check-fonts.ts
   ```
   It lists every font the templates use, marked ✓ installed or ✗ missing, and ends with exit code 1 if any are missing.
2. **Iskoola Pota.** It is used by 90 of the 92 templates. Install it through *Settings → Apps → Optional features → Add a feature → "Sinhala Supplemental Fonts"*.
3. **The older department fonts** (FMAbhaya, FMArjunn, 0KDSAMAN, DL-Manel, AA Amali and others; the full list with counts is in `docs/document-catalogue/CATALOGUE.md`). Copy them from a PC that prints the old documents correctly: open `C:\Windows\Fonts`, then right-click the font and choose *Install for all users*.
4. Run the check again.

On the development PC, a sample filled template printed through Word without these fonts installed, and the Sinhala values were still readable. The fonts matter for matching the old look, not for the text being correct.

## Where things are

| What | Where | Notes |
|---|---|---|
| Original templates | `templates/original/` inside the app *(proposed)* | Read-only. Never edit, replace or delete these files. |
| Generated documents | `Documents\Excise documents\` *(proposed)* | Named `CR 12-2026 - <template>.docx`. Back this folder up. |
| Generation log | `generated-documents.jsonl` in the app data folder *(proposed)* | One line per document made. Moves into the database once A's `generated_documents` table exists. |

### Backup

Include the **generated documents folder** and the **generation log** in the office backup, together with the database (A's backup screen). The original templates don't need backing up separately; they ship with the app and are checked against `MANIFEST.json`.

## Checking the templates are intact

```
node packages/documents/scripts/verify-originals.ts
```

This should print `Original templates OK: 92 files match MANIFEST.json.` The app runs the same check every time it generates a document, and refuses to use a template file that has changed.

## Marking templates current or archived

Staff decide which version of each template is in use.

1. Build the review pack. `--pdf` needs Word.
   ```
   node packages/documents/scripts/review-pack.ts "<folder>" --pdf
   ```
2. Send the folder (or a zip of it) to the officer in charge. They open `index.html`, look at the sample PDFs, and fill `review-sheet.csv` in Excel. It must be saved as **CSV UTF-8**.
3. Apply the sheet:
   ```
   node packages/documents/scripts/apply-review.ts "<sheet.csv>" --dry-run
   node packages/documents/scripts/apply-review.ts "<sheet.csv>"
   ```
   The first command only shows the changes. If any row is wrong, nothing is applied and every problem is listed.
4. Open a pull request with the changed `packages/documents/registry/templates.json`.

## Adding a new template or a new version

See *Adding or replacing a template* in `docs/document-catalogue/CATALOGUE.md`.

In short: the new file is added under a **new name** with `add-template.ts`, the old one is archived, and the project owner approves the change. Originals are never overwritten.

## PDF export

PDF export uses Word on the PC, opening the document read-only. If Word is missing, the app still saves the `.docx` and shows a warning that no PDF was made. Nothing is lost.

## Troubleshooting

| What you see | Cause | What to do |
|---|---|---|
| "template file was changed" | A file in `templates/original` differs from `MANIFEST.json` | Run `verify-originals.ts`, then reinstall the app or restore the file. Never "fix" the manifest. |
| "template is archived" | Staff marked it as an old copy | Use the current version, or change the decision through the review sheet. |
| "template … is not for offence …" | The template belongs to another offence | Pick a template for the CR's offence. If the code itself is wrong, correct it through the review sheet. |
| Plaint missing from the list | The template has no offence code yet | Set the code through the review sheet. |
| Fields printed empty ("left empty") | The CR has no value for those fields | Complete the CR or case details and generate again; the new file gets `(2)`. |
| Text in an odd font | A font is missing on this PC | See **Fonts** above. |
