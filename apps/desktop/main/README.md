# Desktop main process (Member B)

Electron main process, the preload bridge (`../preload`), and the service host that wires every service to the repositories.

## Run

```bash
pnpm install
pnpm start                      # builds main + preload, then opens Electron
```

The window loads C's renderer from `apps/desktop/renderer/dist/index.html`. While C's Vite dev server runs, point the app at it instead:

```bash
EXCISE_RENDERER_URL=http://localhost:5173 pnpm start
```

## Database and mock mode

The app keeps its data in `<userData>/excise.sqlite` (`packages/db`). On a new database there are no accounts: the start screen asks the station head to create the first one.

`EXCISE_MOCK=1 pnpm start` runs on in-memory repositories instead, with 20 sample CRs (2025 and 2026, Sinhala names, cases, convictions; see `src/dev-showcase.ts`) and these dev accounts (password `dev-password`); data is lost when the app closes:

| Username      | Role                      |
| ------------- | ------------------------- |
| `oic`         | Station head (OIC)        |
| `detecting`   | Detecting officers        |
| `observation` | Observation officers      |
| `supervising` | Supervising (AC) officers |

## Calling services from the renderer (C, A, D)

The renderer gets one function, `window.excise.call(channel, ...args)`. Types come from `apps/desktop/preload/src/api.ts`:

```ts
import type {} from '../../preload/src/api'; // adds window.excise types

const r = await window.excise.call('search.crimeReports', { kind: 'year', officeId, year: 2026 });
if (r.ok) showRows(r.value);
else showError(r.error); // { name, message, code?, issues? }
```

- Calls never throw for service errors. Check `ok`.
- `error.issues` lists `{ field, code }` for validation errors, so forms can mark the field.
- `error.name` is `LoginError` with `code: 'not_logged_in'` when nobody is logged in, and `PermissionError` when the role may not do this.
- `reports.export` opens a save dialog in the main process and returns the file path, or `null` if the user cancels. The renderer never passes file paths.
- The channel list is the `handlers` object in `src/host.ts`; argument shapes are in `src/args.ts`.

| Group                | Channels                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login                | `auth.login`, `auth.logout`, `auth.currentSession`, `auth.changePassword`, `auth.needsFirstUser`, `auth.createFirstUser`                                      |
| Users (OIC)          | `auth.createUser`, `auth.unlockUser`, `users.list`, `users.setActive`, `users.resetPassword`                                                                  |
| Reference lists      | `reference.list` (everyone), `reference.add`, `reference.rename`, `reference.setActive`, `reference.remove`, `reference.usageCount` (OIC)                     |
| CRs and cases        | `cr.*`, `case.*`                                                                                                                                              |
| Searches and reports | `search.*`, `reports.run`, `reports.summary`, `reports.export`                                                                                                |
| Audit (OIC)          | `audit.search`                                                                                                                                                |
| Documents            | `docdata.buildFor`, `documents.listFor`, `documents.generate`, `documents.history`, `documents.open`, `documents.showInFolder`                                |
| Pictures             | `files.attach` (opens a file dialog), `files.list`, `files.preview`, `files.open`, `files.remove`                                                             |
| Printing             | `print.certificateE48`, `print.convictsList`, `print.register` (target `printer`, `pdf` or `word`)                                                            |
| Backup (OIC)         | `backup.settings`, `backup.updateSettings`, `backup.chooseFolder`, `backup.now`, `backup.list`, `backup.verify`, `backup.restore`, `backup.restoreFromFolder` |
| Access import (OIC)  | `import.dryRun` (opens a file dialog), `import.run` (imports the file of the last dry run), `import.lastReport`, `import.saveReport`                          |
| Support              | `support.showLogFile`                                                                                                                                         |

Files are only ever named, never passed as paths: `documents.open(crId, fileName)` opens a file from that CR's generation history, `backup.restore(name)` restores a backup listed by `backup.list`, and every other path comes from a dialog the main process opens. Channels whose part is not set up yet (backup before the database exists) fail with `NotAvailableError`.

## Documents, pictures, backups: where they live

| What                                   | Where                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Templates, registry, `docx-to-pdf.ps1` | `packages/documents` in development; `resources/documents` in the installed app (outside asar)                 |
| Generated documents                    | `Documents/Excise documents`                                                                                   |
| "Open in Word" print-outs (`word`)     | `<userData>/Print-outs`, a new file each time, opened in Word for editing                                      |
| Generation log                         | `<userData>/generated-documents.jsonl` (until the `generated_documents` table)                                 |
| Pictures                               | `<userData>/files`, random file names                                                                          |
| Backups                                | the folder the OIC chooses; one `excise-backup-…` folder per backup; daily automatic backup checked every hour |
| Log                                    | `<logs>/main.log` (rotated at 5 MB)                                                                            |

## First run and passwords

- With no accounts yet, `auth.needsFirstUser` is `true`: the UI shows the set-up screen and `auth.createFirstUser` creates the station head (OIC) account. There is no default password.
- Users created or reset by the OIC get `mustChangePassword: true` in their session. Until they call `auth.changePassword`, every channel except the login group fails with `LoginError` code `password_change_required`.

## Security

- `contextIsolation`, `sandbox` on; no Node in the renderer.
- One IPC channel; the main process only accepts calls from the app's own page and only for listed channels.
- Navigation away from the app and pop-up windows are blocked; `https://` links open in the browser.
- A permission check runs inside every service method, so hiding a menu item is never the only protection.
