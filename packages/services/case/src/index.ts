import { assertCan } from '@excise/auth';
import type {
  AuditSink,
  CaseRepository,
  CaseService,
  CrRepository,
  Session,
} from '@excise/contract';
import { CaseInput } from '@excise/schemas';
import type { CaseRecord } from '@excise/schemas';
import { validateOutcomeAllowed, type ValidationIssue } from '@excise/validation';

export class CaseValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`Invalid case: ${issues.map((i) => `${i.field}:${i.code}`).join(', ')}`);
  }
}

export class CaseConflictError extends Error {}

export class DefaultCaseService implements CaseService {
  constructor(
    private readonly cases: CaseRepository,
    private readonly crs: CrRepository,
    private readonly session: () => Session,
    private readonly audit: AuditSink,
  ) {}

  async save(raw: CaseInput, expectedVersion: number | null): Promise<CaseRecord> {
    assertCan(this.session().role, 'case.write');
    const parsed = CaseInput.safeParse(raw);
    if (!parsed.success) {
      throw new CaseValidationError(
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), code: i.code })),
      );
    }
    const input = parsed.data;

    const cr = await this.crs.getById(input.crimeReportId);
    if (!cr || cr.deleted) {
      throw new CaseValidationError([{ field: 'crimeReportId', code: 'not_found' }]);
    }

    const issues: ValidationIssue[] = [
      ...validateOutcomeAllowed(input.caseNumber, input.outcomes.length),
    ];
    // A hearing date cannot be before the detection date (§4.3).
    input.hearings.forEach((h, i) => {
      if (h.date < cr.detectionDate)
        issues.push({ field: `hearings.${i}.date`, code: 'before_detection' });
    });
    if (input.courtDate && input.courtDate < cr.detectionDate) {
      issues.push({ field: 'courtDate', code: 'before_detection' });
    }
    input.outcomes.forEach((o, i) => {
      if (o.outcomeType === 'fine' && o.fineAmount === undefined) {
        issues.push({ field: `outcomes.${i}.fineAmount`, code: 'required' });
      }
      if (o.outcomeType === 'imprisonment' && !o.prisonMonths && !o.prisonDays) {
        issues.push({ field: `outcomes.${i}.prisonMonths`, code: 'required' });
      }
      if (o.convictedDate && o.convictedDate < cr.detectionDate) {
        issues.push({ field: `outcomes.${i}.convictedDate`, code: 'before_detection' });
      }
    });
    if (issues.length) throw new CaseValidationError(issues);

    const before = await this.cases.getByCrimeReport(input.crimeReportId);
    const saved = await this.cases.save(input, expectedVersion);
    if (!saved) throw new CaseConflictError('Case was changed by someone else');
    await this.audit.record({
      userId: this.session().userId,
      action: before ? 'update' : 'create',
      table: 'cases',
      rowId: saved.id,
      before,
      after: saved,
    });
    return saved;
  }

  async getByCrimeReport(crimeReportId: string): Promise<CaseRecord | null> {
    assertCan(this.session().role, 'cr.read');
    return this.cases.getByCrimeReport(crimeReportId);
  }
}
