// CaseRepository: `cases` plus hearings, outcomes, the reward voucher and the CR hand-over.
// One case per CR. `save` inserts when `expectedVersion` is null, otherwise updates; null on a
// version clash (or when a first save finds a case already there).
import type { CaseRepository } from '@excise/contract';
import { CaseRecord, type CaseInput } from '@excise/schemas';
import { sql } from 'kysely';
import type { ExciseDb } from '../src/connection.js';
import { compact, created, flag, now } from './common.js';

export class SqliteCaseRepository implements CaseRepository {
  constructor(private readonly db: ExciseDb) {}

  private columns(input: CaseInput) {
    return {
      court_id: input.courtId,
      court_date: input.courtDate ?? null,
      prosecuting_officer_id: input.prosecutingOfficerId ?? null,
      case_number: input.caseNumber ?? null,
      case_type: input.caseType ?? null,
      sithasi: flag(input.sithasi),
      permission_pending: flag(input.permissionPending),
      withdrawn: flag(input.withdrawn),
      accused_died: flag(input.accusedDied),
      register_volume_no: input.register?.volumeNo ?? null,
      register_volume_page: input.register?.volumePage ?? null,
      register_index_page: input.register?.indexPage ?? null,
      register_index_sn: input.register?.indexSn ?? null,
    };
  }

  private async writeChildren(caseId: string, input: CaseInput): Promise<void> {
    const q = this.db.q;
    await q.deleteFrom('hearings').where('case_id', '=', caseId).execute();
    await q.deleteFrom('outcomes').where('case_id', '=', caseId).execute();
    await q.deleteFrom('reward_vouchers').where('case_id', '=', caseId).execute();
    await q.deleteFrom('cr_handover').where('crime_report_id', '=', input.crimeReportId).execute();
    const at = now();
    const base = () => created(this.db, undefined, at);
    if (input.hearings.length) {
      await q
        .insertInto('hearings')
        .values(
          input.hearings.map((h, position) => ({
            ...base(),
            case_id: caseId,
            position,
            kind: h.kind,
            date: h.date,
            memo: h.memo ?? null,
          })),
        )
        .execute();
    }
    if (input.outcomes.length) {
      await q
        .insertInto('outcomes')
        .values(
          input.outcomes.map((o, position) => ({
            ...base(),
            case_id: caseId,
            position,
            outcome_type: o.outcomeType,
            convicted_date: o.convictedDate ?? null,
            fine_amount: o.fineAmount ?? null,
            prison_months: o.prisonMonths ?? null,
            prison_days: o.prisonDays ?? null,
            receipt_no: o.receiptNo ?? null,
            receipt_date: o.receiptDate ?? null,
            add_to_convict_register: flag(o.addToConvictRegister),
          })),
        )
        .execute();
    }
    if (input.rewardVoucherReceived || input.rewardVoucherDate) {
      await q
        .insertInto('reward_vouchers')
        .values({
          ...base(),
          case_id: caseId,
          received: flag(input.rewardVoucherReceived),
          date: input.rewardVoucherDate ?? null,
        })
        .execute();
    }
    if (input.handover) {
      await q
        .insertInto('cr_handover')
        .values({
          ...base(),
          crime_report_id: input.crimeReportId,
          officer: input.handover.officer ?? null,
          location: input.handover.location ?? null,
          date: input.handover.date ?? null,
        })
        .execute();
    }
  }

  async save(input: CaseInput, expectedVersion: number | null): Promise<CaseRecord | null> {
    const ok = await this.db.transaction(async () => {
      const existing = await this.db.q
        .selectFrom('cases')
        .select(['id', 'version'])
        .where('crime_report_id', '=', input.crimeReportId)
        .executeTakeFirst();
      if (expectedVersion === null) {
        if (existing) return false;
        const base = created(this.db);
        await this.db.q
          .insertInto('cases')
          .values({ ...base, crime_report_id: input.crimeReportId, ...this.columns(input) })
          .execute();
        await this.writeChildren(base.id, input);
        return true;
      }
      if (!existing) return false;
      const r = await this.db.q
        .updateTable('cases')
        .set({
          ...this.columns(input),
          updated_at: now(),
          updated_by: this.db.currentUser(),
          version: sql<number>`version + 1`,
        })
        .where('id', '=', existing.id)
        .where('version', '=', expectedVersion)
        .executeTakeFirst();
      if (Number(r.numUpdatedRows) !== 1) return false;
      await this.writeChildren(existing.id, input);
      return true;
    });
    return ok ? this.getByCrimeReport(input.crimeReportId) : null;
  }

  async getByCrimeReport(crimeReportId: string): Promise<CaseRecord | null> {
    const q = this.db.q;
    const c = await q
      .selectFrom('cases')
      .selectAll()
      .where('crime_report_id', '=', crimeReportId)
      .executeTakeFirst();
    if (!c) return null;
    const [hearings, outcomes, voucher, handover] = await Promise.all([
      q
        .selectFrom('hearings')
        .selectAll()
        .where('case_id', '=', c.id)
        .orderBy('position')
        .execute(),
      q
        .selectFrom('outcomes')
        .selectAll()
        .where('case_id', '=', c.id)
        .orderBy('position')
        .execute(),
      q.selectFrom('reward_vouchers').selectAll().where('case_id', '=', c.id).executeTakeFirst(),
      q
        .selectFrom('cr_handover')
        .selectAll()
        .where('crime_report_id', '=', crimeReportId)
        .executeTakeFirst(),
    ]);
    const register = compact({
      volumeNo: c.register_volume_no,
      volumePage: c.register_volume_page,
      indexPage: c.register_index_page,
      indexSn: c.register_index_sn,
    });
    return CaseRecord.parse({
      id: c.id,
      version: c.version,
      updatedAt: c.updated_at,
      crimeReportId,
      ...compact({
        courtId: c.court_id,
        courtDate: c.court_date,
        prosecutingOfficerId: c.prosecuting_officer_id,
        caseNumber: c.case_number,
        caseType: c.case_type,
      }),
      sithasi: c.sithasi === 1,
      permissionPending: c.permission_pending === 1,
      withdrawn: c.withdrawn === 1,
      accusedDied: c.accused_died === 1,
      hearings: hearings.map((h) => compact({ kind: h.kind, date: h.date, memo: h.memo })),
      outcomes: outcomes.map((o) => ({
        ...compact({
          outcomeType: o.outcome_type,
          convictedDate: o.convicted_date,
          fineAmount: o.fine_amount,
          prisonMonths: o.prison_months,
          prisonDays: o.prison_days,
          receiptNo: o.receipt_no,
          receiptDate: o.receipt_date,
        }),
        addToConvictRegister: o.add_to_convict_register === 1,
      })),
      rewardVoucherReceived: voucher?.received === 1,
      ...(voucher?.date ? { rewardVoucherDate: voucher.date } : {}),
      ...(Object.keys(register).length ? { register } : {}),
      ...(handover
        ? {
            handover: compact({
              officer: handover.officer,
              location: handover.location,
              date: handover.date,
            }),
          }
        : {}),
    });
  }
}
