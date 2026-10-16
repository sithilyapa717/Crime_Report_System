import { assertCan } from '@excise/auth';
import type { AuditSink, CrRepository, CrService, Session } from '@excise/contract';
import { CrimeReportInput } from '@excise/schemas';
import type { CrimeReport } from '@excise/schemas';
import { validateCrDates } from '@excise/validation';

export class CrValidationError extends Error {
  constructor(public readonly issues: { field: string; code: string }[]) {
    super(`Invalid CR: ${issues.map((i) => `${i.field}:${i.code}`).join(', ')}`);
  }
}

export class CrConflictError extends Error {}
export class CrNotFoundError extends Error {}

/**
 * Soft delete with an undo window (§8): within this many days anyone who may enter CRs can
 * restore a deleted CR; after it, only the OIC can. Pending confirmation with the department.
 */
export const RESTORE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export class DefaultCrService implements CrService {
  constructor(
    private readonly repo: CrRepository,
    private readonly session: () => Session,
    private readonly audit: AuditSink,
    private readonly clock: () => number = Date.now,
  ) {}

  private check(raw: unknown): CrimeReportInput {
    const parsed = CrimeReportInput.safeParse(raw);
    if (!parsed.success) {
      throw new CrValidationError(
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), code: i.code })),
      );
    }
    const issues = validateCrDates(parsed.data);
    if (issues.length) throw new CrValidationError(issues);
    return parsed.data;
  }

  private async assertNumberFree(data: CrimeReportInput, exceptId?: string): Promise<void> {
    const live = await this.repo.findByNumber(data.officeId, data.crYear, data.crNumber);
    if (live && live.id !== exceptId) {
      throw new CrValidationError([{ field: 'crNumber', code: 'duplicate' }]);
    }
  }

  private record(
    action: 'create' | 'update' | 'delete' | 'restore',
    rowId: string,
    before: CrimeReport | null,
    after: CrimeReport | null,
  ) {
    return this.audit.record({
      userId: this.session().userId,
      action,
      table: 'crime_reports',
      rowId,
      before,
      after,
    });
  }

  async create(input: CrimeReportInput): Promise<CrimeReport> {
    assertCan(this.session().role, 'cr.write');
    const data = this.check(input);
    await this.assertNumberFree(data);
    const saved = await this.repo.insert(data);
    await this.record('create', saved.id, null, saved);
    return saved;
  }

  async update(id: string, expectedVersion: number, input: CrimeReportInput): Promise<CrimeReport> {
    assertCan(this.session().role, 'cr.write');
    const data = this.check(input);
    const existing = await this.repo.getById(id);
    if (!existing || existing.deleted) throw new CrNotFoundError(id);
    await this.assertNumberFree(data, id);
    const saved = await this.repo.update(id, expectedVersion, data);
    if (!saved) throw new CrConflictError('CR was changed by someone else');
    await this.record('update', id, existing, saved);
    return saved;
  }

  async get(id: string): Promise<CrimeReport | null> {
    assertCan(this.session().role, 'cr.read');
    return this.repo.getById(id);
  }

  async find(officeId: string, crYear: number, crNumber: string): Promise<CrimeReport | null> {
    assertCan(this.session().role, 'cr.read');
    return this.repo.findByNumber(officeId, crYear, crNumber);
  }

  async softDelete(id: string): Promise<void> {
    assertCan(this.session().role, 'cr.write');
    const existing = await this.repo.getById(id);
    if (!existing || existing.deleted) throw new CrNotFoundError(id);
    await this.repo.setDeleted(id, true);
    await this.record('delete', id, existing, null);
  }

  async restore(id: string): Promise<void> {
    const role = this.session().role;
    assertCan(role, 'cr.write');
    const existing = await this.repo.getById(id);
    if (!existing || !existing.deleted) throw new CrNotFoundError(id);
    // `updatedAt` of a deleted CR is its deletion time (CrRepository.setDeleted).
    if (this.clock() - Date.parse(existing.updatedAt) > RESTORE_WINDOW_DAYS * DAY_MS) {
      assertCan(role, 'admin');
    }
    // Its number may have been reused while it was deleted.
    await this.assertNumberFree(existing);
    await this.repo.setDeleted(id, false);
    await this.record('restore', id, null, await this.repo.getById(id));
  }
}
