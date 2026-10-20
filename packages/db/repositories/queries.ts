// Searches (B6) and report rows (A7). Deleted CRs never appear.
import type {
  ConvictFilter,
  ConvictRow,
  CrListRow,
  CrQueryRepository,
  CrSearchFilter,
  ReportRow,
  ReportRowRepository,
  ReportScope,
} from '@excise/contract';
import type { CaseType, OutcomeType } from '@excise/schemas';
import { sql, type SelectQueryBuilder } from 'kysely';
import type { DB } from '../schema/tables.js';
import type { DbHandle } from '../src/handle.js';
import { chunks } from './common.js';

/** Case-insensitive "contains" on a column, with LIKE wildcards in the input escaped. */
const contains = (column: string, text: string) =>
  sql<boolean>`lower(${sql.ref(column)}) LIKE ${'%' + text.toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c) + '%'} ESCAPE '\\'`;

async function outcomesByCase(db: DbHandle, caseIds: string[]) {
  const map = new Map<
    string,
    {
      type: OutcomeType;
      fine: number | null;
      months: number | null;
      days: number | null;
      date: string | null;
    }[]
  >();
  for (const part of chunks(caseIds)) {
    const rows = await db.q
      .selectFrom('outcomes')
      .select([
        'case_id',
        'outcome_type',
        'fine_amount',
        'prison_months',
        'prison_days',
        'convicted_date',
      ])
      .where('case_id', 'in', part)
      .orderBy('case_id')
      .orderBy('position')
      .execute();
    for (const r of rows) {
      const list = map.get(r.case_id) ?? [];
      list.push({
        type: r.outcome_type as OutcomeType,
        fine: r.fine_amount,
        months: r.prison_months,
        days: r.prison_days,
        date: r.convicted_date,
      });
      map.set(r.case_id, list);
    }
  }
  return map;
}

export class SqliteCrQueryRepository implements CrQueryRepository {
  constructor(private readonly db: DbHandle) {}

  private base() {
    return this.db.q
      .selectFrom('crime_reports as cr')
      .innerJoin('accused as a', 'a.crime_report_id', 'cr.id')
      .innerJoin('offices as of', 'of.id', 'cr.office_id')
      .innerJoin('offence_types as ot', 'ot.id', 'cr.offence_type_id')
      .leftJoin('cases as c', 'c.crime_report_id', 'cr.id')
      .leftJoin('courts as ct', 'ct.id', 'c.court_id')
      .where('cr.deleted_at', 'is', null);
  }

  async search(filter: CrSearchFilter): Promise<CrListRow[]> {
    let q = this.base();
    switch (filter.kind) {
      case 'year':
        q = q.where('cr.office_id', '=', filter.officeId).where('cr.cr_year', '=', filter.year);
        break;
      case 'court_date':
        q = q.where('cr.office_id', '=', filter.officeId).where('c.court_date', '=', filter.date);
        break;
      case 'detection_date':
        q = q
          .where('cr.office_id', '=', filter.officeId)
          .where('cr.detection_date', '=', filter.date);
        break;
      case 'court_case':
        q = q
          .where('c.court_id', '=', filter.courtId)
          .where('c.case_number', '=', filter.caseNumber);
        break;
      case 'name_nic':
        if (filter.name) q = q.where(contains('a.name', filter.name));
        if (filter.nic) q = q.where('a.nic', '=', filter.nic);
        break;
    }
    const rows = await q
      .select([
        'cr.id',
        'cr.office_id',
        'of.name as office_name',
        'cr.cr_number',
        'cr.cr_year',
        'cr.month',
        'cr.detection_date',
        'ot.code as offence_code',
        'a.name as accused_name',
        'a.nic as accused_nic',
        'ct.name as court_name',
        'c.court_date',
        'c.case_number',
      ])
      .orderBy('cr.cr_year')
      .orderBy('cr.cr_seq')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      officeId: r.office_id,
      officeName: r.office_name,
      crNumber: r.cr_number,
      crYear: r.cr_year,
      month: r.month,
      detectionDate: r.detection_date,
      offenceCode: r.offence_code,
      accusedName: r.accused_name,
      accusedNic: r.accused_nic,
      courtName: r.court_name,
      courtDate: r.court_date,
      caseNumber: r.case_number,
    }));
  }

  /** People with an outcome marked "add to convicts register" (§1.5 `type`). */
  async convicts(filter: ConvictFilter): Promise<ConvictRow[]> {
    let q = this.base()
      .where('c.id', 'is not', null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('outcomes as o')
            .select('o.id')
            .whereRef('o.case_id', '=', 'c.id')
            .where('o.add_to_convict_register', '=', 1),
        ),
      );
    if (filter.officeId) q = q.where('cr.office_id', '=', filter.officeId);
    if (filter.year) q = q.where('cr.cr_year', '=', filter.year);
    if (filter.month) q = q.where('cr.month', '=', filter.month);
    if (filter.name) q = q.where(contains('a.name', filter.name));
    if (filter.nic) q = q.where('a.nic', '=', filter.nic);
    if (filter.courtId) q = q.where('c.court_id', '=', filter.courtId);
    const rows = await q
      .select([
        'cr.id',
        'cr.cr_number',
        'cr.office_id',
        'a.name as accused_name',
        'a.address as accused_address',
        'a.nic as accused_nic',
        'ot.code as offence_code',
        'ot.name_si as offence_name',
        'cr.quantity',
        'c.id as case_id',
        'c.court_id',
        'ct.name as court_name',
        'c.case_number',
      ])
      .orderBy('cr.cr_year')
      .orderBy('cr.cr_seq')
      .execute();
    const outcomes = await outcomesByCase(
      this.db,
      rows.map((r) => r.case_id!),
    );
    return rows.map((r) => {
      const list = outcomes.get(r.case_id!) ?? [];
      const fine = list.find((o) => o.type === 'fine');
      const prison = list.find((o) => o.type === 'imprisonment');
      return {
        crimeReportId: r.id,
        crNumber: r.cr_number,
        officeId: r.office_id,
        accusedName: r.accused_name,
        accusedAddress: r.accused_address,
        accusedNic: r.accused_nic,
        offenceCode: r.offence_code,
        offenceName: r.offence_name,
        quantity: r.quantity,
        courtId: r.court_id,
        courtName: r.court_name,
        caseNumber: r.case_number,
        convictedDate: list.find((o) => o.date)?.date ?? null,
        outcomes: list.map((o) => o.type),
        fineAmount: fine?.fine ?? null,
        prisonMonths: prison?.months ?? null,
        prisonDays: prison?.days ?? null,
      };
    });
  }
}

interface ReportViewRow {
  crime_report_id: string;
  office_id: string;
  cr_number: string;
  cr_year: number;
  cr_seq: number;
  month: number;
  half_year: string;
  detection_date: string;
  offence_code: string;
  offence_name: string;
  accused_name: string;
  accused_address: string | null;
  accused_nic: string | null;
  detecting_officer_id: string | null;
  detecting_officer_name: string | null;
  informant_id: string | null;
  informant_name: string | null;
  court_name: string | null;
  case_id: string | null;
  court_date: string | null;
  case_number: string | null;
  case_type: string | null;
  permission_pending: number;
  withdrawn: number;
  accused_died: number;
  convicted_date: string | null;
  fine_amount: number | null;
  reward_voucher_received: number;
  add_to_convict_register: number;
  quantity: number | null;
}

export class SqliteReportRowRepository implements ReportRowRepository {
  constructor(private readonly db: DbHandle) {}

  async rowsFor(scope: ReportScope): Promise<ReportRow[]> {
    let q = (
      this.db.q as unknown as { selectFrom: (t: string) => SelectQueryBuilder<DB, never, object> }
    )
      .selectFrom('v_report_rows')
      .selectAll() as unknown as SelectQueryBuilder<
      { v_report_rows: ReportViewRow },
      'v_report_rows',
      ReportViewRow
    >;
    q = q.where('office_id', '=', scope.officeId).where('cr_year', '=', scope.year);
    if (scope.kind === 'month') q = q.where('month', '=', scope.month);
    if (scope.kind === 'half_year') q = q.where('half_year', '=', scope.half);
    const rows = await q.orderBy('cr_seq').execute();

    const ids = rows.map((r) => r.crime_report_id);
    const seized = new Map<string, { itemType: string; quantity: number }[]>();
    for (const part of chunks(ids)) {
      const items = await this.db.q
        .selectFrom('seized_items')
        .select(['crime_report_id', 'item_type', 'quantity'])
        .where('crime_report_id', 'in', part)
        .orderBy('crime_report_id')
        .orderBy('position')
        .execute();
      for (const i of items) {
        seized.set(i.crime_report_id, [
          ...(seized.get(i.crime_report_id) ?? []),
          { itemType: i.item_type, quantity: i.quantity },
        ]);
      }
    }
    const outcomes = await outcomesByCase(
      this.db,
      rows.map((r) => r.case_id).filter((id): id is string => !!id),
    );

    return rows.map((r) => ({
      crimeReportId: r.crime_report_id,
      crNumber: r.cr_number,
      crYear: r.cr_year,
      month: r.month,
      halfYear: r.half_year as 'first' | 'second',
      detectionDate: r.detection_date,
      offenceCode: r.offence_code,
      offenceName: r.offence_name,
      accusedName: r.accused_name,
      accusedAddress: r.accused_address,
      accusedNic: r.accused_nic,
      detectingOfficerId: r.detecting_officer_id,
      detectingOfficerName: r.detecting_officer_name,
      informantId: r.informant_id,
      informantName: r.informant_name,
      courtName: r.court_name,
      courtDate: r.court_date,
      caseNumber: r.case_number,
      caseType: r.case_type as CaseType | null,
      permissionPending: r.permission_pending === 1,
      withdrawn: r.withdrawn === 1,
      accusedDied: r.accused_died === 1,
      outcomes: (r.case_id ? (outcomes.get(r.case_id) ?? []) : []).map((o) => o.type),
      convictedDate: r.convicted_date,
      // PostgreSQL returns SUM over integers as a bigint string.
      fineAmount: r.fine_amount === null ? null : Number(r.fine_amount),
      rewardVoucherReceived: r.reward_voucher_received === 1,
      addToConvictRegister: r.add_to_convict_register === 1,
      quantity: r.quantity,
      seized: seized.get(r.crime_report_id) ?? [],
    }));
  }
}
