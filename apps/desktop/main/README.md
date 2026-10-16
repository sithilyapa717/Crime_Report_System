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

## Mock mode (until A's database lands)

The app runs on in-memory repositories from `packages/services/mocks` with two sample CRs. Data is lost when the app closes. Dev accounts, all with the password `dev-password`:

| Username | Role |
|---|---|
| `oic` | Station head (OIC) |
| `detecting` | Detecting officers |
| `observation` | Observation officers |
| `supervising` | Supervising (AC) officers |

These accounts exist only in mock mode. When A's SQLite repositories are ready, `src/main.ts` swaps `createDevRepositories()` for them (marked `TODO(A)`).

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
- The channel list is the `handlers` object in `src/host.ts`.

## Security

- `contextIsolation`, `sandbox` on; no Node in the renderer.
- One IPC channel; the main process only accepts calls from the app's own page and only for listed channels.
- Navigation away from the app and pop-up windows are blocked; `https://` links open in the browser.
- A permission check runs inside every service method, so hiding a menu item is never the only protection.
