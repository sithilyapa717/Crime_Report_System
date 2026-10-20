// DRAFT by B. Changes to this folder need approval from A, B, C and D.
import type {
  AuditFilter,
  AuditTable,
  CaseInput,
  CaseRecord,
  CaseType,
  ConvictFilter,
  CrimeReport,
  CrimeReportInput,
  CrSearchFilter,
  OutcomeType,
  PreviousOffenceQuery,
  PrintTarget,
  ReferenceInput,
  ReferenceKind,
  ReportParams,
  ReportScope,
  Role,
  SummaryGroupBy,
} from '@excise/schemas';

// Parameter types are defined once, as Zod schemas in packages/shared/schemas.
export type {
  AuditFilter,
  AuditTable,
  BackupSettingsInput,
  ConvictFilter,
  CrSearchFilter,
  PreviousOffenceQuery,
  PrintTarget,
  ReferenceInput,
  ReferenceKind,
  ReportParams,
  ReportPerson,
  ReportScope,
  ReportType,
  SummaryGroupBy,
} from '@excise/schemas';

// ============================ Service interfaces (UI and D code against these) ============================

export interface Session {
  userId: string;
  username: string;
  role: Role;
  /** First login or after an OIC reset: the UI shows only the change-password screen. */
  mustChangePassword: boolean;
}

export interface AuthService {
  login(username: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  currentSession(): Promise<Session | null>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  /** OIC only (users screen, A). The new user must change the password at first login. */
  createUser(username: string, password: string, role: Role): Promise<void>;
  /** True until the first account exists (first run): the UI then shows the set-up screen. */
  needsFirstUser(): Promise<boolean>;
  /** First run only: creates the first OIC account and logs it in. Fails once any user exists. */
  createFirstUser(username: string, password: string): Promise<Session>;
}

export interface CrService {
  create(input: CrimeReportInput): Promise<CrimeReport>;
  update(id: string, expectedVersion: number, input: CrimeReportInput): Promise<CrimeReport>;
  get(id: string): Promise<CrimeReport | null>;
  find(officeId: string, crYear: number, crNumber: string): Promise<CrimeReport | null>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

export interface CaseService {
  /** `expectedVersion` is null for the first save of a CR's case. */
  save(input: CaseInput, expectedVersion: number | null): Promise<CaseRecord>;
  getByCrimeReport(crimeReportId: string): Promise<CaseRecord | null>;
}

/** One line in a search result list. */
export interface CrListRow {
  id: string;
  officeId: string;
  officeName: string;
  crNumber: string;
  crYear: number;
  month: number;
  detectionDate: string;
  offenceCode: string;
  accusedName: string;
  accusedNic: string | null;
  courtName: string | null;
  courtDate: string | null;
  caseNumber: string | null;
}

/** One convicted outcome line (convicts register, previous-offence check, certificate ඊ 48). */
export interface ConvictRow {
  crimeReportId: string;
  crNumber: string;
  officeId: string;
  accusedName: string;
  accusedAddress: string | null;
  accusedNic: string | null;
  offenceCode: string;
  offenceName: string;
  /** `Quantity` (whole number). */
  quantity: number | null;
  courtId: string | null;
  courtName: string | null;
  caseNumber: string | null;
  convictedDate: string | null;
  outcomes: OutcomeType[];
  fineAmount: number | null;
  prisonMonths: number | null;
  prisonDays: number | null;
}

export interface SearchService {
  crimeReports(filter: CrSearchFilter): Promise<CrListRow[]>;
  convicts(filter: ConvictFilter): Promise<ConvictRow[]>;
  /** Previous-offence check: needs a name or NIC; court is optional. */
  previousOffences(query: PreviousOffenceQuery): Promise<ConvictRow[]>;
}

/** `labelKey` points into packages/shared/labels; the UI shows the Sinhala caption. */
export interface ReportColumn {
  key: string;
  labelKey: string;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  /** Sum of fines (cents) over the rows. */
  fineTotal: number;
}

export interface SummaryGroup {
  key: string;
  label: string;
  count: number;
  /** Total per seized item type (sp1-sp15). */
  quantities: Record<string, number>;
  /** Sum of the CRs' `Quantity` field. */
  quantityTotal: number;
  fineTotal: number;
}

export interface ReportService {
  run(params: ReportParams): Promise<ReportResult>;
  summary(params: ReportParams, groupBy: SummaryGroupBy): Promise<SummaryGroup[]>;
  /** Writes the report to `filePath` and returns it. */
  exportToFile(params: ReportParams, format: 'xlsx' | 'csv', filePath: string): Promise<string>;
}

/** B8: the data set a Word template needs; keys are the merge-field names. */
export interface DocDataService {
  buildFor(crimeReportId: string): Promise<Record<string, string>>;
}

// ============== Repository interfaces (implemented by A in packages/db; services depend only on these) ==============

export interface CrRepository {
  insert(input: CrimeReportInput): Promise<CrimeReport>;
  /** Returns null when the stored version differs from `expectedVersion`. */
  update(id: string, expectedVersion: number, input: CrimeReportInput): Promise<CrimeReport | null>;
  /** Returns deleted CRs too (`deleted: true`), so they can be shown and restored. */
  getById(id: string): Promise<CrimeReport | null>;
  /** The live (not deleted) CR with this number, or null. */
  findByNumber(officeId: string, crYear: number, crNumber: string): Promise<CrimeReport | null>;
  /** Sets the flag and bumps `version` / `updatedAt`, so `updatedAt` of a deleted CR is its deletion time. */
  setDeleted(id: string, deleted: boolean): Promise<void>;
}

export interface CaseRepository {
  getByCrimeReport(crimeReportId: string): Promise<CaseRecord | null>;
  /** Insert when `expectedVersion` is null; otherwise update. Returns null on a version clash. */
  save(input: CaseInput, expectedVersion: number | null): Promise<CaseRecord | null>;
}

/** Read-only queries for searches (A writes the SQL; deleted CRs are excluded). */
export interface CrQueryRepository {
  search(filter: CrSearchFilter): Promise<CrListRow[]>;
  convicts(filter: ConvictFilter): Promise<ConvictRow[]>;
}

/** One flattened CR + case row for the report engine (A7). Deleted CRs are excluded. */
export interface ReportRow {
  crimeReportId: string;
  crNumber: string;
  crYear: number;
  month: number;
  halfYear: 'first' | 'second';
  detectionDate: string;
  offenceCode: string;
  offenceName: string;
  accusedName: string;
  accusedAddress: string | null;
  accusedNic: string | null;
  detectingOfficerId: string | null;
  detectingOfficerName: string | null;
  informantId: string | null;
  informantName: string | null;
  courtName: string | null;
  courtDate: string | null;
  caseNumber: string | null;
  caseType: CaseType | null;
  permissionPending: boolean;
  withdrawn: boolean;
  accusedDied: boolean;
  outcomes: OutcomeType[];
  convictedDate: string | null;
  /** Sum of fine outcomes in cents, null when no fine was recorded. */
  fineAmount: number | null;
  rewardVoucherReceived: boolean;
  addToConvictRegister: boolean;
  /** `Quantity` (whole number). */
  quantity: number | null;
  seized: { itemType: string; quantity: number }[];
}

export interface ReportRowRepository {
  rowsFor(scope: ReportScope): Promise<ReportRow[]>;
}

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  failedAttempts: number;
  mustChangePassword: boolean;
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserRecord | null>;
  getById(id: string): Promise<UserRecord | null>;
  create(user: Omit<UserRecord, 'id' | 'failedAttempts'>): Promise<UserRecord>;
  setFailedAttempts(id: string, count: number): Promise<void>;
  /** Also sets `mustChangePassword`. */
  setPasswordHash(id: string, hash: string, mustChangePassword: boolean): Promise<void>;
  list(): Promise<UserRecord[]>;
  setActive(id: string, active: boolean): Promise<void>;
  count(): Promise<number>;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'login'
  | 'login_failed'
  | 'user_create'
  | 'user_unlock'
  | 'user_update'
  | 'password_change'
  | 'password_reset'
  | 'reference_add'
  | 'reference_update'
  | 'reference_delete'
  | 'file_attach'
  | 'file_remove'
  | 'backup'
  | 'backup_restore'
  | 'document_generate'
  | 'import';

/** One change for the audit log (who, what, old and new values). The sink adds the time. */
export interface AuditEntry {
  /** Null for a failed login, where nobody is logged in. */
  userId: string | null;
  action: AuditAction;
  table: AuditTable;
  rowId: string | null;
  before: unknown;
  after: unknown;
}

/** A's audit service implements this; services call it after every change. */
export interface AuditSink {
  record(entry: AuditEntry): Promise<void>;
}

/** Reference names by id (A's reference service implements this). */
export interface ReferenceLookup {
  name(id: string): Promise<string | null>;
  offence(id: string): Promise<{ code: string; nameSi: string } | null>;
}

// ============================ Added for REMAINING_WORK §3.2 ============================

// ---- Reference lists (A11) ----

export interface ReferenceItem {
  id: string;
  kind: ReferenceKind;
  value: string;
  /** Offences only. */
  code: string | null;
  /** Officers only. */
  rank: string | null;
  active: boolean;
}

/** Every drop-down reads `list`; the 14 list editors (OIC only) use the rest. */
export interface ReferenceService {
  /** Sorted by value; inactive items only when asked (the editor shows them, drop-downs do not). */
  list(kind: ReferenceKind, opts?: { includeInactive?: boolean }): Promise<ReferenceItem[]>;
  add(kind: ReferenceKind, input: ReferenceInput): Promise<ReferenceItem>;
  /** A rename shows everywhere, because records keep the id (REWRITE_PLAN §2). */
  rename(id: string, input: ReferenceInput): Promise<ReferenceItem>;
  setActive(id: string, active: boolean): Promise<void>;
  /** Only when nothing uses it; otherwise deactivate. */
  remove(id: string): Promise<void>;
  /** How many CRs point at this item (deleted ones too: they can be restored). */
  usageCount(id: string): Promise<number>;
}

export interface ReferenceRepository {
  list(kind: ReferenceKind, includeInactive: boolean): Promise<ReferenceItem[]>;
  getById(id: string): Promise<ReferenceItem | null>;
  /** Case-insensitive match on the value within one list. */
  findByValue(kind: ReferenceKind, value: string): Promise<ReferenceItem | null>;
  insert(kind: ReferenceKind, input: ReferenceInput, active?: boolean): Promise<ReferenceItem>;
  update(id: string, input: ReferenceInput): Promise<ReferenceItem | null>;
  setActive(id: string, active: boolean): Promise<void>;
  /** Hard delete; the service only calls it when `usageCount` is 0. */
  delete(id: string): Promise<void>;
  usageCount(id: string): Promise<number>;
}

// ---- Audit viewer (A10) ----

export interface AuditRecord extends AuditEntry {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** Current name of `userId`, for the viewer. */
  username: string | null;
}

export interface AuditQueryRepository {
  /** Newest first. */
  search(filter: AuditFilter): Promise<AuditRecord[]>;
}

/** OIC only. */
export interface AuditQueryService {
  search(filter: AuditFilter): Promise<AuditRecord[]>;
}

// ---- Users screen (A) ----

export interface UserSummary {
  id: string;
  username: string;
  role: Role;
  active: boolean;
  locked: boolean;
  mustChangePassword: boolean;
}

/** OIC only. `AuthService.createUser` and `unlockUser` create and unlock. */
export interface UserAdminService {
  list(): Promise<UserSummary[]>;
  /** An OIC cannot deactivate their own account. */
  setActive(userId: string, active: boolean): Promise<void>;
  /** Sets a temporary password; the user must change it at the next login. Also unlocks. */
  resetPassword(userId: string, temporaryPassword: string): Promise<void>;
}

// ---- Backup and restore (A8) ----

export interface BackupInfo {
  /** Folder name inside the backup folder (`excise-backup-…`); the UI passes this back, never a path. */
  name: string;
  createdAt: string;
  sizeBytes: number;
  kind: 'auto' | 'manual' | 'before_restore';
}

export interface BackupSettings {
  /** Null until the OIC chooses one; automatic backups wait for it. */
  folder: string | null;
  keep: number;
  dailyEnabled: boolean;
  lastBackupAt: string | null;
}

export interface BackupCheck {
  ok: boolean;
  /** `PRAGMA integrity_check` result, or why the backup cannot be read. */
  detail: string;
}

/** Main-process service. Paths come from the main process's own dialogs, never from the UI. */
export interface BackupService {
  settings(): Promise<BackupSettings>;
  updateSettings(patch: Partial<Omit<BackupSettings, 'lastBackupAt'>>): Promise<BackupSettings>;
  /** Database + pictures into a new folder; prunes old automatic backups beyond `keep`. */
  backupNow(kind?: BackupInfo['kind']): Promise<BackupInfo>;
  listBackups(): Promise<BackupInfo[]>;
  verify(backupDir: string): Promise<BackupCheck>;
  /** Takes a `before_restore` backup first, then replaces the database and pictures. */
  restore(backupDir: string): Promise<void>;
  /** For the scheduler: daily backup on, folder set, and none in the last 24 hours. */
  isDue(now: Date): Promise<boolean>;
}

// ---- Pictures and files (A9) ----

export interface StoredFile {
  id: string;
  crimeReportId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface FileRepository {
  insert(file: StoredFile & { storedName: string }): Promise<void>;
  listFor(crimeReportId: string): Promise<StoredFile[]>;
  get(id: string): Promise<(StoredFile & { storedName: string }) | null>;
  /** Soft delete: the file stays on disk until the orphan clean-up. */
  setDeleted(id: string): Promise<void>;
  /** Stored names of live files, for the orphan clean-up. */
  liveStoredNames(): Promise<Set<string>>;
}

/** Main-process service; `attach` takes a path the main process got from its own open dialog. */
export interface FileService {
  attach(crimeReportId: string, sourcePath: string): Promise<StoredFile>;
  list(crimeReportId: string): Promise<StoredFile[]>;
  /** Absolute path for `shell.openPath`; main process only. */
  pathOf(id: string): Promise<string>;
  /** `data:` URL of a picture for the entry form (pictures only, size-limited). */
  preview(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
}

// ---- Printing (D9 layouts, printed by the main process) ----

/** Each returns the saved PDF path, `true` when sent to the printer, or null when cancelled. */
export interface PrintService {
  certificateE48(
    query: PreviousOffenceQuery,
    target: PrintTarget,
  ): Promise<string | boolean | null>;
  convictsList(filter: ConvictFilter, target: PrintTarget): Promise<string | boolean | null>;
  register(params: ReportParams, target: PrintTarget): Promise<string | boolean | null>;
}

// ---- Access import (A13/A14) ----

export interface ImportException {
  /** Legacy row (CR number, or the row index when it has none). */
  row: string;
  column: string;
  value: string;
  reason:
    | 'bad_date'
    | 'bad_number'
    | 'bad_nic'
    | 'bad_cr_number'
    | 'duplicate_cr'
    | 'missing_required'
    | 'other';
}

export interface ImportTotals {
  crs: number;
  crsByYear: Record<string, number>;
  /** Cents. */
  finesByYear: Record<string, number>;
  quantityByOffence: Record<string, number>;
}

export interface ImportReport {
  mode: 'dry_run' | 'run';
  startedAt: string;
  finishedAt: string;
  rowsRead: number;
  imported: number;
  skipped: number;
  /** Names not found in the reference lists; created as inactive "unverified" items on a real run. */
  unverifiedRefs: { kind: ReferenceKind; value: string }[];
  exceptions: ImportException[];
  totals: ImportTotals;
  /** Every legacy column accounted for (§11): nothing is dropped silently. */
  columns: {
    /** In the file but not in the importer's column list: their data is NOT imported. */
    unmapped: string[];
    /** In the column list but not in the file. */
    missing: string[];
    /** Known columns with no field in the new schema yet, with how many rows have a value. */
    notStored: Record<string, number>;
  };
  /** Rows read from each legacy lookup table (seeded into the reference lists). */
  lookupRows: Record<string, number>;
  picturesCopied: number;
}

/** OIC only, one-time. `accdbPath` comes from the main process's open dialog. */
export interface ImportService {
  dryRun(accdbPath: string): Promise<ImportReport>;
  run(accdbPath: string): Promise<ImportReport>;
  lastReport(): Promise<ImportReport | null>;
}

// Documents (D5/D6): A's `document_templates` and `generated_documents` tables implement D's own
// `TemplateSource` and `GenerationLog` interfaces from @excise/documents, so they are not repeated here.
