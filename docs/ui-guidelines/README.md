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

## Tokens (`design-system/styles.css`)

| Token                                                   | Use                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `--role-yellow`                                         | the four role buttons on the start screen                                                        |
| `--tag-blue`, `--tag-pink`                              | field label tags, as on the old forms                                                            |
| `--section-times`, `--section-cash`, `--section-seized` | orange / blue / purple boxes for times, cash and seized quantities (`FormSection tone="times"`…) |
| `--primary`, `--danger`, `--ok`, `--warn`               | actions and messages                                                                             |
| Font                                                    | Noto Sans Sinhala, bundled (`@fontsource/noto-sans-sinhala`); no internet needed                 |

## Components (`design-system/index.ts`)

| Component                                                               | Notes                                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Button`                                                                | `variant`: default, primary, danger, ghost; `busy` shows a spinner. Captions wrap, never clip |
| `BigMenuButton`, `MenuGrid`                                             | main-menu buttons; `yellow` for the role buttons                                              |
| `TextField`, `PasswordField`, `TextArea`                                | label tag (`tag="pink"` for the pink ones), `error`, `hint`                                   |
| `DateField`                                                             | shows and accepts `YYYY.MM.DD` (also `-` or `/`); value is ISO or `undefined`                 |
| `TimeField`                                                             | free text kept as typed (14.45 or 14:45)                                                      |
| `NumberField`                                                           | `decimals` for quantities; empty is `undefined`                                               |
| `Select`                                                                | options `{ value, label, disabled }`; a filter box appears for lists over 12                  |
| `Checkbox`, `RadioGroup`                                                |                                                                                               |
| `FormSection`, `FieldGrid`, `Actions`                                   | boxed field groups with the old colours; a responsive field grid; a right-aligned button row  |
| `Tabs`                                                                  | `invalid` marks a tab with errors; arrow-key navigation                                       |
| `Table`                                                                 | click a heading to sort, optional filter, totals row, pages of 500 rows                       |
| `Dialog`, `ConfirmDialog`                                               | native `<dialog>` (focus trap, Escape)                                                        |
| `Alert`, `Badge`, `Spinner`, `EmptyState`, `ToastProvider` / `useToast` |                                                                                               |
| `formatDate`, `parseDateInput`, `formatMoney`                           | display helpers (money from cents)                                                            |

## Shell (`shell/`)

- `routes.ts`: the screens, the four role menus (old captions and order) and `allowed(role, route)`.
- `navigation.tsx`: a small stack router (`go`, `back`, `home`); no URLs.
- `AppShell.tsx`: header (user, role, change password, log out) and the main menu laid out like the old one (two colour-coded columns; reports and list editing on the right).
- Register a screen in `src/screens.tsx`; until then the menu item shows "built in a later phase".

## Tests

- Components and menus: `design-system/design-system.test.tsx` (Vitest + jsdom).
- Flows on the real Electron app: `tests/e2e/*.spec.ts` (Playwright). Screenshots go to `.cache/e2e-shots/` for review.
