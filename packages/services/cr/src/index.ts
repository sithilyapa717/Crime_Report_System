import { assertCan } from '@excise/auth';
import type { CrRepository, CrService, Session } from '@excise/contract';
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

export class DefaultCrService implements CrService {
  constructor(
    private readonly repo: CrRepository,
    private readonly session: () => Session,
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

  async create(input: CrimeReportInput): Promise<CrimeReport> {
    assertCan(this.session().role, 'cr.write');
    const data = this.check(input);
    const dup = await this.repo.findByNumber(data.officeId, data.crYear, data.crNumber);
    if (dup && !dup.deleted) {
      throw new CrValidationError([{ field: 'crNumber', code: 'duplicate' }]);
    }
    return this.repo.insert(data);
  }

  async update(id: string, expectedVersion: number, input: CrimeReportInput): Promise<CrimeReport> {
    assertCan(this.session().role, 'cr.write');
    const data = this.check(input);
    const existing = await this.repo.getById(id);
    if (!existing) throw new CrNotFoundError(id);
    const clash = await this.repo.findByNumber(data.officeId, data.crYear, data.crNumber);
    if (clash && clash.id !== id && !clash.deleted) {
      throw new CrValidationError([{ field: 'crNumber', code: 'duplicate' }]);
    }
    const saved = await this.repo.update(id, expectedVersion, data);
    if (!saved) throw new CrConflictError('CR was changed by someone else');
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
    await this.repo.setDeleted(id, true);
  }

  async restore(id: string): Promise<void> {
    assertCan(this.session().role, 'cr.write');
    await this.repo.setDeleted(id, false);
  }
}
