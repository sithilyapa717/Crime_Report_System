# Wiring Member D's package into the app

`packages/documents` is the package `@excise/documents` (entry: `packages/documents/index.ts`). This page lists what B and C need to do to use it. Each item is a request to the owner of that folder.

## 1. Workspace (B, root config)

Add `packages/documents` to `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/desktop/*"
  - "packages/shared/*"
  - "packages/services/*"
  - "packages/documents"
```

## 2. Main process (B, `apps/desktop/main`)

Build these once at start-up:

```ts
import {
  DocumentGenerator, DocumentsService, JsonLinesGenerationLog, TemplateRegistry, exportPdfWithWord,
} from '@excise/documents';

const registry = await TemplateRegistry.load();          // A's document_templates table later
const log = new JsonLinesGenerationLog(join(dataDir, 'generated-documents.jsonl')); // A's table later
const generator = new DocumentGenerator({
  registry,
  originalsDir: join(resourcesDir, 'templates', 'original'), // ship templates/original read-only
  outputDir: join(documentsDir, 'Excise documents'),
  log,
  ...(process.platform === 'win32' ? { pdfExporter: exportPdfWithWord } : {}),
});
const documents = new DocumentsService({ docData, generator, registry, log, session: current });
```

Proposed IPC channels, next to `docdata.buildFor`:

| Channel | Call | Returns |
|---|---|---|
| `documents.listFor` | `documents.listFor(crId)` | `DialogData`: CR number, offence, template groups, history, `pdfAvailable` |
| `documents.generate` | `documents.generate(crId, templateId, { pdf })` | `DialogResult`: file path, optional PDF path, coded warnings |
| `documents.history` | `documents.history(crId)` | earlier generations, newest first |
| `documents.open` | `shell.openPath(filePath)` | opens the generated file in Word |
| `documents.showInFolder` | `shell.showItemInFolder(filePath)` | shows the file in its folder |

The role check is already done: `DocumentsService` calls `DocDataService.buildFor`, which asserts `documents.generate`.

### Printing the layouts

Every print layout returns `{ html, landscape, footerTemplate }`. Print it from a hidden window:

```ts
const win = new BrowserWindow({ show: false });
await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(layout.html));
const pdf = await win.webContents.printToPDF({
  landscape: layout.landscape, pageSize: 'A4', printBackground: true,
  displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: layout.footerTemplate,
});
// or win.webContents.print() for the printer dialog
```

| Layout | Input |
|---|---|
| `renderCertificateE48(rows)` | `SearchService.previousOffences(...)` rows (one certificate per row) |
| `renderConvictsList(rows, { year, month?, officeName? })` | `SearchService.convicts(...)` rows |
| `renderRegister(result, { title, subtitle?, caption })` | `ReportService.run(...)`; `caption` maps `labelKey` to the Sinhala caption |

## 3. Labels (B keeps `packages/shared/labels`; all four approve)

The dialog needs captions for these values. None exist yet, so wording must be agreed.

- **Families:** `plaint`, `charge-sheet`, `reward-voucher`, `motion-sheet`, `warrant-extension`, `previous-record`, `production`, `other`.
- **Template status:** `unconfirmed`, `current`.
- **Warning codes:** `unconfirmed`, `other_offence`, `empty_fields`, `pdf_failed`, `pdf_unavailable`.
- **Dialog title:** "ලේඛන සාදන්න" (from TEAM_WORK_SPLIT).
- **Register titles and column captions:** for `renderRegister`, the `report.col.*` keys from B7.

## 4. Documents dialog screen (D, built with C's components)

`apps/desktop/renderer/documents-dialog/` waits for C's renderer setup and design system. The screen will:

1. call `documents.listFor(crId)`;
2. show the groups, with an "unconfirmed" badge and the variant (can or bottle, ml, Rs note);
3. offer a PDF tick box when `pdfAvailable` is true;
4. call `documents.generate(...)`, then show the warnings and "Open" / "Show in folder" buttons;
5. show the history list.

## 5. Found in the full review (for B)

- **`pnpm-lock.yaml` on `main` doesn't install.** Both pnpm 10 and pnpm 11 reject it with "expected a single document in the stream, but found more". The file contains two YAML documents; the second starts at line 158.
- **`vitest.config.ts` includes `packages/**/*.test.ts`.** Member D's tests use `node:test`, which CI's `run-tests.ts` runs correctly. But `pnpm test` (Vitest) would also pick them up and report "no test suite found". Please exclude `packages/documents/**`, or run D's files with `node --test` there too.
- **Packaging.** `generation/docx-to-pdf.ps1` and `scripts/pdf-batch.ps1` are run by PowerShell, which can't read files inside an asar archive. `templates/original/` must also be real files on disk. Add both to `asarUnpack`, or ship them as extra resources, in the electron-builder config.
- **Warnings.** `DocumentGenerator` and `DocumentsService` now return warnings as `{ code, detail }`. Show the Sinhala caption for `code` and keep `detail` for the log.

## 6. Open questions for B

- **Who formats values?** `@excise/docdata` formats money as `1,500.50` and passes times through as `14:45`. D's formatters give `1500` and `14.45`, and the print layouts use D's. The proposal is that B returns raw values and D formats them in one place.
- **Convicts list column order.** B7's `CONVICT_COLUMNS` follows REWRITE_PLAN §1.6: name, offence, quantity, address, court, date, case, fine, sentences, NIC. The old monthly report (§97) has CR, name, NIC, offence, quantity, fine, address, court, case, date, then the sentences. The print layout follows §97. Staff should confirm it against an old printout.
