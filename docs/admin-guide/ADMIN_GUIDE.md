# Crime Report System – administrator guide

For the station head and IT staff. Documents-specific details (templates, fonts, PDF) are in [DOCUMENTS_ADMIN.md](DOCUMENTS_ADMIN.md).

## 1. Installing

1. Run `Excise-Crime-Reports-Setup-<version>.exe` (built with `pnpm dist`, in `release/`). Choose "for all users". Neither Node, Access nor an internet connection is needed.
2. Start **Excise Crime Reports**.
3. Optional: Microsoft Word for PDF export of documents; the Microsoft Access Database Engine (64-bit) only for the one-time import.

The installer is not code-signed yet, so Windows SmartScreen may warn the first time.

## 2. First start: the station head's account

On a new installation there are no accounts and no default password. The app shows **Create the station head account**: choose a user name and a password (at least 8 characters). This is the only account that can be created without logging in.

## 3. Users (Administration → Users)

- **Add a user:** user name, section (role) and a temporary password. The user must choose their own password at the first login.
- **Reset password:** gives a new temporary password and unlocks the account.
- **Unlock:** after 5 wrong passwords an account is locked.
- **Deactivate:** the account can no longer log in. Its history stays. You cannot deactivate your own account.

## 4. Lists (සංස්කරණය)

The 14 lists of the old app, one tab each. **Add**, **Rename** (the new name shows on every CR, old ones too), **Deactivate** (no longer offered in drop-downs) and **Delete** (only when no CR uses it, deleted CRs included). Offences need a code (PUDS, UPG, …); officers may have a rank.

## 5. Backup and restore (Administration → Backup and restore)

1. **Choose folder:** a USB drive or a network folder, not the PC's own disk only.
2. **Daily automatic backup** is on by default: the app checks every hour and backs up once a day while it is running. **Keep** sets how many automatic backups stay (older ones are removed; manual ones never).
3. **Back up now** before big changes (an import, an upgrade).
4. **Check** confirms a backup is complete and readable.
5. **Restore** replaces all data with that backup. The app first saves a copy of the current data (kind "before a restore"), then restarts. **Restore from another folder** restores from a backup that is not in the chosen folder (e.g. a USB drive on a new PC).

A backup is one folder `excise-backup-<date>-<kind>` with the database, the pictures and a `backup.json` checksum. Do a test restore on a spare PC from time to time.

## 6. Change history (Administration → Change history)

Who created, changed, deleted or restored what and when: CRs, cases, users, lists, pictures, backups, documents. Filter by date, user and record type; click a row to see the old and new values. Passwords never appear.

## 7. Import from Access (Administration → Import from Access)

One time, from the old `Excise Department 2021.accdb`. Needs the 64-bit Microsoft Access Database Engine. The app only ever opens a **copy** of the file.

1. **Back up now** first.
2. **Check an Access file (dry run):** choose the `.accdb`. Nothing is saved. Read the report:
   - **Values that could not be read:** dates, numbers or NICs that are wrong in Access. They are not guessed; the raw value is kept in the CR's notes.
   - **Names not in the lists:** added as inactive items; check them in සංස්කරණය afterwards.
   - **Columns NOT imported:** columns the importer does not know (tell the developers).
   - **Totals:** compare with the old Access reports.
3. **Save the report (CSV)** to work through it in Excel; correct the values in a copy of the Access file and run the check again.
4. **Import this file** imports the file that was just checked. Rows already imported are not imported twice.

Details and the command-line check: `packages/migration/README.md`.

## 8. Fonts

The station head's main menu warns when fonts used by the Word templates are missing on this PC. The documents still have the right wording, but may print in another font. See [DOCUMENTS_ADMIN.md](DOCUMENTS_ADMIN.md), "Fonts".

## 9. Where things are

| What                        | Where                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| Database                    | `%APPDATA%\Excise Crime Reports\excise.sqlite`                         |
| Pictures                    | `%APPDATA%\Excise Crime Reports\files`                                 |
| Backup settings             | `%APPDATA%\Excise Crime Reports\backup-settings.json`                  |
| Last import report          | `%APPDATA%\Excise Crime Reports\import-report.json`                    |
| Generated documents         | `Documents\Excise documents`                                           |
| Log file (for support)      | `%APPDATA%\Excise Crime Reports\logs\main.log`                         |
| Program, templates, scripts | the installation folder (`resources\documents`, `resources\migration`) |

Uninstalling the app does not delete the data in `%APPDATA%`.

## 10. Upgrading

1. **Back up now.**
2. Run the new installer over the old one. The data stays; the database is upgraded automatically at the next start (migrations).
3. Log in and check a few CRs.

## 11. Problems

| Problem                                        | What to do                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| "The application must close"                   | Note the time; send `logs\main.log` to support                                                                                          |
| Account locked                                 | Station head: Users → Unlock                                                                                                            |
| Forgot the station head's password             | Restore is not needed: another station-head account can reset it. If there is none, contact support (the database must be opened by IT) |
| "Someone else changed this record"             | Reopen the CR and enter the changes again                                                                                               |
| Import: "Access Database Engine not installed" | Install the 64-bit Microsoft Access Database Engine on this PC                                                                          |
