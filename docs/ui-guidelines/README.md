# UI guidelines (C1)

The renderer is React + TypeScript in `apps/desktop/renderer`, built by Vite to `dist/index.html`, which the Electron main process loads. Screens talk to the services only through `call()` in `src/ipc.ts`.

## Rules

1. **Captions come from `@excise/labels`.** Never type Sinhala (or English UI text) into a component. Use `label('menu.reports')`; add new keys to `packages/shared/labels` (`si: null` until the department approves the wording).
2. **No inline styles.** The built app has a strict Content-Security-Policy (`style-src 'self'`): use the classes in `design-system/styles.css` or a screen's own `.css` file.
3. **No paths, no Node.** The renderer is sandboxed. Files are picked by the main process (`files.attach`, `reports.export`, `backup.chooseFolder`, …).
4. **Every service call can fail.** `call()` throws `IpcError`: show `err.caption`, and put `err.fieldErrors()` on the form fields. A lost session is handled by the shell.
5. **Hiding is not protecting.** Menus hide what a role may not do (`shell/routes.ts`), and every service checks again.
6. **Keyboard first.** Every control is reachable with Tab, has a visible label and shows focus; tabs move with the arrow keys; dialogs close with Escape.

## Running

```bash
pnpm dev:renderer                                       # Vite dev server on :5173
EXCISE_RENDERER_URL=http://localhost:5173 pnpm start    # the app, using the dev server
pnpm build && pnpm start                                # the built app
pnpm test:e2e                                           # Playwright on the real app (builds first)
```

`EXCISE_MOCK=1` runs the app on in-memory data with the dev accounts (see `apps/desktop/main/README.md`).

## Design source

The screens follow the Figma file "Crime Report System - UI" (frames 01-08 and the Components frame, October 2026 revision), with every typeface replaced by the bundled Noto Sans Sinhala. Its Sinhala wording is in `@excise/labels`. Frames 09 (documents dialog, D), 10 (list editor, A) and 11 (users, backup, audit, A) belong to other members.

## Tokens (`design-system/styles.css`)

The values are the Figma variables (`color/*`, `radius/*`, `space/*`).

| Token                                      | Value                | Use                                                                                  |
| ------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------ |
| `--bg`                                     | `#efece7`            | page background (also behind the top bar)                                            |
| `--surface`, `--surface-alt`               | `#ffffff`, `#f6f3ee` | cards; filled inputs, table rows, the find-a-CR strip                                |
| `--text`, `--text-muted`                   | `#1e1e1e`, `#4d473f` | body text; labels, captions, table headers                                           |
| `--border`                                 | `#d3cabd`            | inputs, secondary buttons, chips                                                     |
| `--primary`, `--primary-soft`              | `#1e1e1e`, `#f1ece4` | black pill buttons, selected role card; badges and the access chip                   |
| `--accent`, `--accent-soft`                | `#f5cb45`, `#fbf0c9` | focus ring, selected chips, hovered or opened table rows, menu icon on hover         |
| `--danger`, `--ok`                         | `#c23434`, `#2e9a5c` | delete buttons and errors; the "saved" toast                                         |
| `--edit`, `--edit-bg`                      | `#2a64b8`, `#e7effa` | edit / rename buttons in list rows (deactivate is amber, activate green, delete red) |
| `--radius-sm`, `--radius`, `--radius-card` | 6, 12, 22 px         | thumbnails; inputs and rows; cards                                                   |
| Font                                       |                      | Noto Sans Sinhala, bundled (`@fontsource/noto-sans-sinhala`); no internet needed     |

## Components (`design-system/index.ts`)

| Component                                                                                          | Notes                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                                           | `variant`: default (white, blue text), primary, danger (red outline), ghost; `busy` shows a spinner                                     |
| `Icon`                                                                                             | Lucide-style line icons (`name`), `currentColor`; inline SVG, CSP-safe                                                                  |
| `TextField`, `PasswordField`, `TextArea`, `DateField`, `TimeField`, `NumberField`, `Select`        | label above, 42px box; `tag="pink"` keeps the old required marker as a dot                                                              |
| `Checkbox`, `RadioGroup`, `ChipGroup`                                                              | `ChipGroup` is a single choice shown as pills (report scope, person, type)                                                              |
| `Card`                                                                                             | the white rounded panel every screen is built from; optional `title` and `actions`                                                      |
| `FormSection`, `FieldGrid`, `Actions`                                                              | a titled field group (inside `.cr-columns` it becomes an outlined card)                                                                 |
| `Tabs`                                                                                             | pill tabs (the active one white); `invalid` adds a red dot and ⚠; arrow keys move                                                       |
| `Table`                                                                                            | rows as rounded strips with a chevron when clickable; click a heading to sort, `filterable`, totals row, `selectedKey` highlights a row |
| `Dialog`, `ConfirmDialog`, `Alert`, `Badge`, `Spinner`, `EmptyState`, `ToastProvider` / `useToast` |                                                                                                                                         |
| `formatDate`, `parseDateInput`, `formatMoney`                                                      | display helpers (money from cents)                                                                                                      |

Layout classes: `.ex-filters` (a row of filter fields with the button aligned to the inputs) and `.ex-results-foot` (count left, buttons right) for search screens.

## Shell (`shell/`)

- `routes.ts`: the screens, the four role menus (old captions and order) and `allowed(role, route)`.
- `navigation.tsx`: a small stack router (`go`, `back`, `home`); no URLs.
- `AppShell.tsx`: the top bar (round back button, screen title, role · office, main-menu and change-password buttons) and the main menu: the role with the log-out button, then four group cards (crime reports, registers, convicts, reports & admin), each item with an icon and a one-line description.
- Register a screen in `src/screens.tsx`; until then the menu item shows "built in a later phase".

## Tests

- Components and menus: `design-system/design-system.test.tsx` (Vitest + jsdom).
- Flows on the real Electron app: `tests/e2e/*.spec.ts` (Playwright). Screenshots go to `.cache/e2e-shots/` for review.
