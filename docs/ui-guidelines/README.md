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

The screen layouts follow the Figma file "Crime Report System - UI" (frames 01-08 and the Components frame, October 2026 revision), with every typeface replaced by the bundled Noto Sans Sinhala. Its Sinhala wording is in `@excise/labels`. Frames 09 (documents dialog, D), 10 (list editor, A) and 11 (users, backup, audit, A) belong to other members.

The look (colours, glass, radii, controls, the sidebar) follows the "Crime Report System" design system artifact: a palette sampled from two summit wallpapers, one wallpaper per screen, and frosted glass over it.

- **One wallpaper per screen.** The app has `design-system/backgrounds/summit-clear.webp` behind the whole window (`.ex-backdrop` on the shell, under a 40% ice scrim). Sign-in, first run and password change have `summit-cloud.webp` (`start-login.css`). Never place a second photo or a photo panel on top of a wallpaper.
- **Glass over it.** The sidebar is dark glass (90% `--deep-crevasse`). The top bar, menu tiles and stat cards are light `--glass` (68% white). Cards and form sections holding tables and forms are `--glass-strong` (88%). Dialogs, inputs and toasts stay opaque. Without `backdrop-filter` every glass falls back to near-opaque.
- **Text never sits on the bare photo.** Every text colour holds 4.5:1 on its glass even over the darkest rock in the photo.
- The layers that apply this are at the end of `design-system/styles.css` (dashboard look, glass, tick boxes, clean glass controls). The component CSS above them is unchanged.

## Tokens (`design-system/styles.css`)

| Token                                                                         | Value                            | Use                                                                                                                   |
| ----------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--glacier-mist`, `--frost`, `--sky-teal`, `--ridge-slate`, `--deep-crevasse` | `#e1f2ef` … `#143a4b`            | the palette, sampled from the wallpapers; role tokens alias these                                                     |
| `--bg`                                                                        | `#eef6f5`                        | page ground under the wallpaper scrim                                                                                 |
| `--surface`, `--surface-alt`, `--heading-bg`                                  | `#ffffff`, `#f5faf9`, mist       | cards and inputs; hover and footer strips; table heads                                                                |
| `--text`, `--text-muted`                                                      | `#143a4b`, `#3f5f69`             | body text; labels, captions, table heads                                                                              |
| `--border`, `--border-strong`                                                 | `#d3e3e1`, `#5f8189`             | hairlines (decorative); input and control edges (4.2:1)                                                               |
| `--primary`, `--accent`, `--accent-soft`                                      | ridge slate, sky teal, `#dcf0f4` | primary buttons; focus ring, current sidebar item, selected-row edge; selection                                       |
| `--edit-*`, `--warn-*`, `--ok-*`, `--danger-*`                                | `-tint`, `-ink`, …               | row actions, tags, alerts: see-through tints with dark inks (edit blue, deactivate amber, activate green, delete red) |
| `--glass`, `--glass-strong`, `--glass-line`, `--glass-button`                 | white at 68 / 88 / 72 / 62%      | the three glass strengths and their bright rim                                                                        |
| `--sidebar-*`                                                                 |                                  | the dark glass sidebar                                                                                                |
| `--radius-sm`, `--radius`, `--radius-card`, `--radius-pill`                   | 8, 10, 16, 999 px                | tags; buttons, inputs, menu items; cards and glass; chips and tabs                                                    |
| Font                                                                          |                                  | Noto Sans Sinhala, bundled unhinted (`design-system/fonts/`); no internet needed                                      |

## Components (`design-system/index.ts`)

| Component                                                                                          | Notes                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                                           | `variant`: default (white glass), primary (ridge slate), edit, warn, ok, danger (see-through tints), ghost; `busy` shows a spinner                |
| `Icon`                                                                                             | Lucide-style line icons (`name`), `currentColor`; inline SVG, CSP-safe                                                                            |
| `TextField`, `PasswordField`, `TextArea`, `DateField`, `TimeField`, `NumberField`, `Select`        | label above, 42px box; `tag="pink"` keeps the old required marker as a dot                                                                        |
| `Checkbox`, `RadioGroup`, `ChipGroup`                                                              | tick boxes and radios are drawn (rounded box, white tick); `ChipGroup` is a single choice shown as pills (report scope, person, type)             |
| `Card`                                                                                             | the white rounded panel every screen is built from; optional `title` and `actions`                                                                |
| `FormSection`, `FieldGrid`, `Actions`                                                              | a titled field group (inside `.cr-columns` it becomes an outlined card)                                                                           |
| `Tabs`                                                                                             | pill tabs (the active one white); `invalid` adds a red dot and ⚠; arrow keys move                                                                 |
| `Table`                                                                                            | ruled rows under a pale header strip, a chevron when clickable; click a heading to sort, `filterable`, totals row, `selectedKey` highlights a row |
| `Dialog`, `ConfirmDialog`, `Alert`, `Badge`, `Spinner`, `EmptyState`, `ToastProvider` / `useToast` |                                                                                                                                                   |
| `formatDate`, `parseDateInput`, `formatMoney`                                                      | display helpers (money from cents)                                                                                                                |

Layout classes: `.ex-filters` (a row of filter fields with the button aligned to the inputs) and `.ex-results-foot` (count left, buttons right) for search screens.

## Shell (`shell/`)

- `routes.ts`: the screens, the four role menus (old captions and order) and `allowed(role, route)`.
- `navigation.tsx`: a small stack router (`go`, `open`, `back`, `home`); no URLs. `open` is for the sidebar: the stack becomes main menu → that screen.
- `AppShell.tsx`: the sidebar, which is the main menu. It shows the role's items in four groups (crime reports, registers, convicts, reports & admin; old captions and order, the description as a tooltip), marks the current screen, and has log out at the bottom. Then the glass top bar (round back button, screen title, role · office, main-menu, text-size and change-password buttons) and the screen. The main menu page greets the role; what else it shows is still to be decided. Below 1100px the sidebar keeps only its icons; the captions stay for screen readers.
- Some screens' own buttons carry their menu item's caption (the convicts search button is "වරදකරුවන්ගේ ලේඛනය"). In e2e tests, press a screen's own button inside `main` (`screenButton` in `searches-reports.spec.ts`).
- Register a screen in `src/screens.tsx`; until then the menu item shows "built in a later phase".

## Tests

- Components and menus: `design-system/design-system.test.tsx` (Vitest + jsdom).
- Flows on the real Electron app: `tests/e2e/*.spec.ts` (Playwright). Screenshots go to `.cache/e2e-shots/` for review.
