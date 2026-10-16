// DRAFT by B. Changes to this folder need approval from A, B, C and D.
import type { CaseInput, CrimeReport, CrimeReportInput, Role } from '@excise/schemas';

export interface Session {
  userId: string;
  username: string;
  role: Role;
}

export interface AuthService {
  login(username: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  currentSession(): Promise<Session | null>;
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
  save(input: CaseInput): Promise<void>;
  getByCrimeReport(crimeReportId: string): Promise<CaseInput | null>;
}

export interface SearchService {
  byYear(officeId: string, year: number): Promise<CrimeReport[]>;
  byCourtDate(officeId: string, date: string): Promise<CrimeReport[]>;
  byDetectionDate(officeId: string, date: string): Promise<CrimeReport[]>;
  byCourtAndCaseNumber(courtId: string, caseNumber: string): Promise<CrimeReport[]>;
  byNameOrNic(query: { name?: string; nic?: string }): Promise<CrimeReport[]>;
}

export type ReportScope =
  | { kind: 'year'; officeId: string; year: number }
  | { kind: 'month'; officeId: string; year: number; month: number }
  | { kind: 'half_year'; officeId: string; year: number; half: 'first' | 'second' };

export type ReportPerson =
  | { kind: 'none' }
  | { kind: 'detecting_officer' | 'informant'; officerId: string };

export type ReportType =
  | 'register'
  | 'warrant'
  | 'trial'
  | 'summons'
  | 'not_filed'
  | 'fines_not_collected'
  | 'rewards_due'
  | 'resolved'
  | 'fines_earned'
  | 'convicts';

export interface ReportParams {
  scope: ReportScope;
  person: ReportPerson;
  type: ReportType;
}

export interface ReportResult {
  columns: { key: string; labelSi: string }[];
  rows: Record<string, string | number | null>[];
}

export interface ReportService {
  run(params: ReportParams): Promise<ReportResult>;
  exportToFile(params: ReportParams, format: 'xlsx' | 'csv'): Promise<string>;
}

/** B8: the data set a Word template needs; keys are the merge-field names. */
export interface DocDataService {
  buildFor(crimeReportId: string): Promise<Record<string, string>>;
}

// ---- Repository interfaces (implemented by A in packages/db; services depend only on these) ----

export interface CrRepository {
  insert(input: CrimeReportInput): Promise<CrimeReport>;
  /** Returns null when the stored version differs from `expectedVersion`. */
  update(id: string, expectedVersion: number, input: CrimeReportInput): Promise<CrimeReport | null>;
  getById(id: string): Promise<CrimeReport | null>;
  findByNumber(officeId: string, crYear: number, crNumber: string): Promise<CrimeReport | null>;
  setDeleted(id: string, deleted: boolean): Promise<void>;
}
