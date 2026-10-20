// In-memory repositories for tests and for building screens before A's SQLite layer exists.
// They follow the contract in packages/shared/contract; replace them with packages/db when ready.
import { randomUUID } from 'node:crypto';
import type {
  AuditEntry,
  AuditFilter,
  AuditQueryRepository,
  AuditRecord,
  AuditSink,
  CaseRepository,
  ConvictFilter,
  ConvictRow,
  CrListRow,
  CrQueryRepository,
  CrRepository,
  CrSearchFilter,
  FileRepository,
  ReferenceItem,
  ReferenceLookup,
  ReferenceRepository,
  ReportRow,
  ReportRowRepository,
  ReportScope,
  StoredFile,
  UserRecord,
  UserRepository,
} from '@excise/contract';
import type {
  CaseInput,
  CaseRecord,
  CrimeReport,
  CrimeReportInput,
  ReferenceInput,
  ReferenceKind,
} from '@excise/schemas';

export interface RefEntry {
  kind: ReferenceKind;
  name: string;
  /** Offence code (offence entries only). */
  code?: string;
  rank?: string;
  active?: boolean;
}

export class MemoryStore {
  refs = new Map<string, RefEntry>();
  crs = new Map<string, CrimeReport>();
  cases = new Map<string, CaseRecord>();
  users = new Map<string, UserRecord>();
  audit: (AuditEntry & { id: string; at: string })[] = [];
  files = new Map<string, StoredFile & { storedName: string; deleted: boolean }>();

  addRef(entry: RefEntry): string {
    const id = randomUUID();
    this.refs.set(id, entry);
    return id;
  }
}

const now = () => new Date().toISOString();
const lower = (s: string) => s.toLocaleLowerCase();

export class MemoryCrRepository implements CrRepository {
  constructor(private readonly s: MemoryStore) {}

  async insert(input: CrimeReportInput): Promise<CrimeReport> {
    const t = now();
    const row: CrimeReport = {
      ...input,
      id: randomUUID(),
      version: 1,
      createdAt: t,
      updatedAt: t,
      deleted: false,
    };
    this.s.crs.set(row.id, row);
    return row;
  }

  async update(id: string, expectedVersion: number, input: CrimeReportInput) {
    const cur = this.s.crs.get(id);
    if (!cur || cur.version !== expectedVersion) return null;
    const row: CrimeReport = { ...cur, ...input, version: cur.version + 1, updatedAt: now() };
    this.s.crs.set(id, row);
    return row;
  }

  async getById(id: string) {
    return this.s.crs.get(id) ?? null;
  }

  async findByNumber(officeId: string, crYear: number, crNumber: string) {
    for (const r of this.s.crs.values()) {
      if (!r.deleted && r.officeId === officeId && r.crYear === crYear && r.crNumber === crNumber) {
        return r;
      }
    }
    return null;
  }

  async setDeleted(id: string, deleted: boolean) {
    const cur = this.s.crs.get(id);
    if (cur) this.s.crs.set(id, { ...cur, deleted, version: cur.version + 1, updatedAt: now() });
  }
}

export class MemoryAuditSink implements AuditSink {
  constructor(private readonly s: MemoryStore) {}

  async record(entry: AuditEntry) {
    this.s.audit.push({ ...entry, id: randomUUID(), at: now() });
  }
}

export class MemoryAuditQueryRepository implements AuditQueryRepository {
  constructor(private readonly s: MemoryStore) {}

  async search(filter: AuditFilter): Promise<AuditRecord[]> {
    // `from`/`to` are calendar dates; compare on the date part of the timestamp.
    return this.s.audit
      .filter(
        (e) =>
          (!filter.table || e.table === filter.table) &&
          (!filter.rowId || e.rowId === filter.rowId) &&
          (!filter.userId || e.userId === filter.userId) &&
          (!filter.from || e.at.slice(0, 10) >= filter.from) &&
          (!filter.to || e.at.slice(0, 10) <= filter.to),
      )
      .reverse()
      .slice(0, filter.limit ?? 200)
      .map((e) => ({
        ...e,
        username: e.userId ? (this.s.users.get(e.userId)?.username ?? null) : null,
      }));
  }
}

export class MemoryCaseRepository implements CaseRepository {
  constructor(private readonly s: MemoryStore) {}

  async getByCrimeReport(crimeReportId: string) {
    return this.s.cases.get(crimeReportId) ?? null;
  }

  async save(input: CaseInput, expectedVersion: number | null) {
    const cur = this.s.cases.get(input.crimeReportId);
    if (expectedVersion === null ? cur : !cur || cur.version !== expectedVersion) return null;
    const row: CaseRecord = {
      ...input,
      id: cur?.id ?? randomUUID(),
      version: (cur?.version ?? 0) + 1,
      updatedAt: now(),
    };
    this.s.cases.set(input.crimeReportId, row);
    return row;
  }
}

/** Builds the flattened rows that A's SQL views will return. */
function reportRow(s: MemoryStore, cr: CrimeReport): ReportRow {
  const c = s.cases.get(cr.id);
  const ref = (id?: string) => (id ? (s.refs.get(id) ?? null) : null);
  const offence = ref(cr.offenceTypeId);
  const fines =
    c?.outcomes.filter((o) => o.outcomeType === 'fine' && o.fineAmount !== undefined) ?? [];
  return {
    crimeReportId: cr.id,
    crNumber: cr.crNumber,
    crYear: cr.crYear,
    month: cr.month,
    halfYear: cr.halfYear,
    detectionDate: cr.detectionDate,
    offenceCode: offence?.code ?? '',
    offenceName: offence?.name ?? '',
    accusedName: cr.accused.name,
    accusedAddress: cr.accused.address ?? null,
    accusedNic: cr.accused.nic ?? null,
    detectingOfficerId: cr.detectingOfficerId ?? null,
    detectingOfficerName: ref(cr.detectingOfficerId)?.name ?? null,
    informantId: cr.informantId ?? null,
    informantName: ref(cr.informantId)?.name ?? null,
    courtName: ref(c?.courtId)?.name ?? null,
    courtDate: c?.courtDate ?? null,
    caseNumber: c?.caseNumber?.trim() || null,
    caseType: c?.caseType ?? null,
    permissionPending: c?.permissionPending ?? false,
    withdrawn: c?.withdrawn ?? false,
    accusedDied: c?.accusedDied ?? false,
    outcomes: c?.outcomes.map((o) => o.outcomeType) ?? [],
    convictedDate: c?.outcomes.find((o) => o.convictedDate)?.convictedDate ?? null,
    fineAmount: fines.length ? fines.reduce((sum, o) => sum + (o.fineAmount ?? 0), 0) : null,
    rewardVoucherReceived: c?.rewardVoucherReceived ?? false,
    addToConvictRegister: c?.outcomes.some((o) => o.addToConvictRegister) ?? false,
    quantity: cr.quantity ?? null,
    seized: cr.seizedItems.map((i) => ({ itemType: i.itemType, quantity: i.quantity })),
  };
}

function inScope(r: ReportRow, cr: CrimeReport, scope: ReportScope): boolean {
  if (cr.officeId !== scope.officeId || r.crYear !== scope.year) return false;
  if (scope.kind === 'month') return r.month === scope.month;
  if (scope.kind === 'half_year') return r.halfYear === scope.half;
  return true;
}

export class MemoryReportRowRepository implements ReportRowRepository {
  constructor(private readonly s: MemoryStore) {}

  async rowsFor(scope: ReportScope): Promise<ReportRow[]> {
    return [...this.s.crs.values()]
      .filter((cr) => !cr.deleted)
      .map((cr) => [cr, reportRow(this.s, cr)] as const)
      .filter(([cr, r]) => inScope(r, cr, scope))
      .map(([, r]) => r);
  }
}

export class MemoryCrQueryRepository implements CrQueryRepository {
  constructor(private readonly s: MemoryStore) {}

  async search(filter: CrSearchFilter): Promise<CrListRow[]> {
    const out: CrListRow[] = [];
    for (const cr of this.s.crs.values()) {
      if (cr.deleted) continue;
      const c = this.s.cases.get(cr.id);
      const match =
        filter.kind === 'year'
          ? cr.officeId === filter.officeId && cr.crYear === filter.year
          : filter.kind === 'court_date'
            ? cr.officeId === filter.officeId && c?.courtDate === filter.date
            : filter.kind === 'detection_date'
              ? cr.officeId === filter.officeId && cr.detectionDate === filter.date
              : filter.kind === 'court_case'
                ? c?.courtId === filter.courtId && c.caseNumber === filter.caseNumber
                : (!filter.name || lower(cr.accused.name).includes(lower(filter.name))) &&
                  (!filter.nic || cr.accused.nic === filter.nic);
      if (!match) continue;
      out.push({
        id: cr.id,
        officeId: cr.officeId,
        officeName: this.s.refs.get(cr.officeId)?.name ?? '',
        crNumber: cr.crNumber,
        crYear: cr.crYear,
        month: cr.month,
        detectionDate: cr.detectionDate,
        offenceCode: this.s.refs.get(cr.offenceTypeId)?.code ?? '',
        accusedName: cr.accused.name,
        accusedNic: cr.accused.nic ?? null,
        courtName: c ? (this.s.refs.get(c.courtId)?.name ?? null) : null,
        courtDate: c?.courtDate ?? null,
        caseNumber: c?.caseNumber ?? null,
      });
    }
    return out;
  }

  async convicts(filter: ConvictFilter): Promise<ConvictRow[]> {
    const out: ConvictRow[] = [];
    for (const cr of this.s.crs.values()) {
      const c = this.s.cases.get(cr.id);
      if (cr.deleted || !c) continue;
      const listed = c.outcomes.filter((o) => o.addToConvictRegister);
      if (!listed.length) continue;
      if (filter.officeId && cr.officeId !== filter.officeId) continue;
      if (filter.year && cr.crYear !== filter.year) continue;
      if (filter.month && cr.month !== filter.month) continue;
      if (filter.name && !lower(cr.accused.name).includes(lower(filter.name))) continue;
      if (filter.nic && cr.accused.nic !== filter.nic) continue;
      if (filter.courtId && c.courtId !== filter.courtId) continue;
      const fine = c.outcomes.find((o) => o.outcomeType === 'fine');
      const prison = c.outcomes.find((o) => o.outcomeType === 'imprisonment');
      out.push({
        crimeReportId: cr.id,
        crNumber: cr.crNumber,
        officeId: cr.officeId,
        accusedName: cr.accused.name,
        accusedAddress: cr.accused.address ?? null,
        accusedNic: cr.accused.nic ?? null,
        offenceCode: this.s.refs.get(cr.offenceTypeId)?.code ?? '',
        offenceName: this.s.refs.get(cr.offenceTypeId)?.name ?? '',
        quantity: cr.quantity ?? null,
        courtId: c.courtId,
        courtName: this.s.refs.get(c.courtId)?.name ?? null,
        caseNumber: c.caseNumber ?? null,
        convictedDate: c.outcomes.find((o) => o.convictedDate)?.convictedDate ?? null,
        outcomes: c.outcomes.map((o) => o.outcomeType),
        fineAmount: fine?.fineAmount ?? null,
        prisonMonths: prison?.prisonMonths ?? null,
        prisonDays: prison?.prisonDays ?? null,
      });
    }
    return out;
  }
}

export class MemoryUserRepository implements UserRepository {
  constructor(private readonly s: MemoryStore) {}

  async findByUsername(username: string) {
    for (const u of this.s.users.values()) if (u.username === username) return u;
    return null;
  }

  async getById(id: string) {
    return this.s.users.get(id) ?? null;
  }

  async create(user: Omit<UserRecord, 'id' | 'failedAttempts'>) {
    const row: UserRecord = { ...user, id: randomUUID(), failedAttempts: 0 };
    this.s.users.set(row.id, row);
    return row;
  }

  async setFailedAttempts(id: string, count: number) {
    const u = this.s.users.get(id);
    if (u) this.s.users.set(id, { ...u, failedAttempts: count });
  }

  async setPasswordHash(id: string, hash: string, mustChangePassword: boolean) {
    const u = this.s.users.get(id);
    if (u) this.s.users.set(id, { ...u, passwordHash: hash, mustChangePassword });
  }

  async list() {
    return [...this.s.users.values()];
  }

  async setActive(id: string, active: boolean) {
    const u = this.s.users.get(id);
    if (u) this.s.users.set(id, { ...u, active });
  }

  async count() {
    return this.s.users.size;
  }
}

const toItem = (id: string, r: RefEntry): ReferenceItem => ({
  id,
  kind: r.kind,
  value: r.name,
  code: r.code ?? null,
  rank: r.rank ?? null,
  active: r.active ?? true,
});

export class MemoryReferenceRepository implements ReferenceRepository {
  constructor(private readonly s: MemoryStore) {}

  async list(kind: ReferenceKind, includeInactive: boolean) {
    return [...this.s.refs.entries()]
      .filter(([, r]) => r.kind === kind && (includeInactive || r.active !== false))
      .map(([id, r]) => toItem(id, r))
      .sort((a, b) => a.value.localeCompare(b.value));
  }

  async getById(id: string) {
    const r = this.s.refs.get(id);
    return r ? toItem(id, r) : null;
  }

  async findByValue(kind: ReferenceKind, value: string) {
    for (const [id, r] of this.s.refs) {
      if (r.kind === kind && lower(r.name) === lower(value)) return toItem(id, r);
    }
    return null;
  }

  async insert(kind: ReferenceKind, input: ReferenceInput, active = true) {
    const id = this.s.addRef({
      kind,
      name: input.value,
      ...(input.code ? { code: input.code } : {}),
      ...(input.rank ? { rank: input.rank } : {}),
      active,
    });
    return toItem(id, this.s.refs.get(id)!);
  }

  async update(id: string, input: ReferenceInput) {
    const r = this.s.refs.get(id);
    if (!r) return null;
    const next: RefEntry = { ...r, name: input.value, code: input.code, rank: input.rank };
    this.s.refs.set(id, next);
    return toItem(id, next);
  }

  async setActive(id: string, active: boolean) {
    const r = this.s.refs.get(id);
    if (r) this.s.refs.set(id, { ...r, active });
  }

  async delete(id: string) {
    this.s.refs.delete(id);
  }

  /** Mocks only: any CR (deleted ones too) or case whose stored JSON mentions the id. */
  async usageCount(id: string) {
    let n = 0;
    for (const cr of this.s.crs.values()) {
      if (JSON.stringify(cr).includes(id)) n++;
      else if (JSON.stringify(this.s.cases.get(cr.id) ?? {}).includes(id)) n++;
    }
    return n;
  }
}

export class MemoryFileRepository implements FileRepository {
  constructor(private readonly s: MemoryStore) {}

  async insert(file: StoredFile & { storedName: string }) {
    this.s.files.set(file.id, { ...file, deleted: false });
  }

  async listFor(crimeReportId: string) {
    return [...this.s.files.values()]
      .filter((f) => f.crimeReportId === crimeReportId && !f.deleted)
      .map((f) => ({
        id: f.id,
        crimeReportId: f.crimeReportId,
        originalName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        createdAt: f.createdAt,
      }));
  }

  async get(id: string) {
    const f = this.s.files.get(id);
    if (!f || f.deleted) return null;
    return {
      id: f.id,
      crimeReportId: f.crimeReportId,
      originalName: f.originalName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt,
      storedName: f.storedName,
    };
  }

  async setDeleted(id: string) {
    const f = this.s.files.get(id);
    if (f) this.s.files.set(id, { ...f, deleted: true });
  }

  async liveStoredNames() {
    return new Set([...this.s.files.values()].filter((f) => !f.deleted).map((f) => f.storedName));
  }
}

export class MemoryReferenceLookup implements ReferenceLookup {
  constructor(private readonly s: MemoryStore) {}

  async name(id: string) {
    return this.s.refs.get(id)?.name ?? null;
  }

  async offence(id: string) {
    const r = this.s.refs.get(id);
    return r?.code ? { code: r.code, nameSi: r.name } : null;
  }
}

export interface MemoryRepositories {
  store: MemoryStore;
  crs: MemoryCrRepository;
  cases: MemoryCaseRepository;
  queries: MemoryCrQueryRepository;
  reportRows: MemoryReportRowRepository;
  users: MemoryUserRepository;
  refs: MemoryReferenceLookup;
  audit: MemoryAuditSink;
  references: MemoryReferenceRepository;
  auditQuery: MemoryAuditQueryRepository;
  files: MemoryFileRepository;
}

export function createMemoryRepositories(store = new MemoryStore()): MemoryRepositories {
  return {
    store,
    crs: new MemoryCrRepository(store),
    cases: new MemoryCaseRepository(store),
    queries: new MemoryCrQueryRepository(store),
    reportRows: new MemoryReportRowRepository(store),
    users: new MemoryUserRepository(store),
    refs: new MemoryReferenceLookup(store),
    audit: new MemoryAuditSink(store),
    references: new MemoryReferenceRepository(store),
    auditQuery: new MemoryAuditQueryRepository(store),
    files: new MemoryFileRepository(store),
  };
}
export * from './fixtures.js';
