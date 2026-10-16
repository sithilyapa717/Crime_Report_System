# Folder owners

Every folder has one owner. **Only edit files in your own folders.** To change something in someone else's folder, ask the owner (open an issue or a draft pull request labelled `request`). `CODEOWNERS` enforces this on GitHub.

| Member | Role | GitHub |
|---|---|---|
| **A** | Database | [@yohanruchitha2-star](https://github.com/yohanruchitha2-star) |
| **B** | Logical system | [@senanayakenithikas-ux](https://github.com/senanayakenithikas-ux) |
| **C** | UI / UX | [@methuliH](https://github.com/methuliH) |
| **D** | Documents | [@sithilyapa717](https://github.com/sithilyapa717) |
| **Project owner** | Plans, read-only material, `CODEOWNERS` | [@sithilyapa717](https://github.com/sithilyapa717) |

- Full rules and the reasons are in `TEAM_WORK_SPLIT.md` ("File system and ownership").

| Folder | Owner | Notes |
|---|---|---|
| `apps/desktop/main/` | B | Electron main process, window, IPC, service host |
| `apps/desktop/preload/` | B | Safe bridge between UI and main process |
| `apps/desktop/renderer/design-system/` | C | Colours, buttons, fields, tables, dialogs |
| `apps/desktop/renderer/shell/` | C | Layout, navigation, route registry, role menus |
| `apps/desktop/renderer/screens/start-login/` | C | |
| `apps/desktop/renderer/screens/cr-entry/` | C | CR form framework + Detection, Accused, Surety, Court tabs |
| `apps/desktop/renderer/screens/cr-entry-tabs/` | A | Times, Cash, Seized items tabs |
| `apps/desktop/renderer/screens/cr-view/` | C | |
| `apps/desktop/renderer/screens/case-progress/` | C | |
| `apps/desktop/renderer/screens/reports/` | C | Reports menu, 9 selector screens, result tables |
| `apps/desktop/renderer/screens/convicts/` | C | |
| `apps/desktop/renderer/screens/previous-offences/` | C | Includes by-court, CR-by-name, case-number lookup |
| `apps/desktop/renderer/screens/reference-lists/` | A | The 14 list editors |
| `apps/desktop/renderer/screens/admin/` | A | Users, backup and restore, audit viewer |
| `apps/desktop/renderer/documents-dialog/` | D | "ලේඛන සාදන්න" dialog |
| `packages/shared/labels/` | all four approve | Every Sinhala caption. Locked |
| `packages/shared/schemas/` | B | Zod schemas and types |
| `packages/shared/contract/` | all four approve | Frozen service and repository interfaces |
| `packages/services/*` | B | Except `reference/` and `audit/` (A) |
| `packages/db/` | A | The only place with SQL |
| `packages/migration/` | A | Access importer and checks |
| `packages/documents/` | D | Engine, mapping, registry, print layouts |
| `packages/documents/templates/original/` | project owner | The 98 Word files, **read-only** |
| `tests/e2e/` | C | |
| `tests/reports-parity/` | B | |
| `tests/documents-fidelity/` | D | |
| `tests/migration/` | A | |
| `prototype/` | project owner | Reference only, read-only |
| `docs/legacy-*`, `docs/LEGACY_*` | project owner | Generated from the old system, read-only |
| `docs/database-design/` | A | |
| `docs/document-catalogue/`, `user-guide/`, `admin-guide/`, `engine-notes/` | D | |
| `docs/ui-guidelines/` | C | |
| Root config (`package.json`, lint, TypeScript config) | B | |
