// DRAFT by B. Changes to this folder need approval from A, B, C and D.
import type {
  CaseInput,
  CaseRecord,
  CaseType,
  ConvictFilter,
  CrimeReport,
  CrimeReportInput,
  CrSearchFilter,
  OutcomeType,
  PreviousOffenceQuery,
  ReportParams,
  ReportScope,
  Role,
  SummaryGroupBy,
} from '@excise/schemas';

// Parameter types are defined once, as Zod schemas in packages/shared/schemas.
export type {
  ConvictFilter,
  CrSearchFilter,
  PreviousOffenceQuery,
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
}

export interface AuthService {
  login(username: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  currentSession(): Promise<Session | null>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  /** OIC only (users screen, A). */
  createUser(username: string, password: string, role: Role): Promise<void>;
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
  quantityText: string | null;
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
  getById(id: string): Promise<CrimeReport | null>;
  findByNumber(officeId: string, crYear: number, crNumber: string): Promise<CrimeReport | null>;
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
  quantityText: string | null;
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
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserRecord | null>;
  getById(id: string): Promise<UserRecord | null>;
  create(user: Omit<UserRecord, 'id' | 'failedAttempts'>): Promise<UserRecord>;
  setFailedAttempts(id: string, count: number): Promise<void>;
  setPasswordHash(id: string, hash: string): Promise<void>;
}

/** Reference names by id (A's reference service implements this). */
export interface ReferenceLookup {
  name(id: string): Promise<string | null>;
  offence(id: string): Promise<{ code: string; nameSi: string } | null>;
}
