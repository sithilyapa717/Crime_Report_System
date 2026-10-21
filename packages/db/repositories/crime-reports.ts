// CrRepository: a CR is the `crime_reports` row plus its child rows (accused, surety, times,
// support officers, seized items, cash notes, productions). Saves replace the child rows inside
// one transaction. Rules from the contract: `findByNumber` returns only the live CR; `setDeleted`
// bumps `version` and `updatedAt`; `update` fails (null) on a version clash.
import type { CrRepository } from '@excise/contract';
import { CrimeReport, type CrimeReportInput } from '@excise/schemas';
import { sql } from 'kysely';
import type { CrimeReportsTable } from '../schema/tables.js';
import type { DbHandle } from '../src/handle.js';
import { chunks, compact, created, now } from './common.js';

const seqOf = (crNumber: string) => Number(crNumber.split('/')[0]);

function headerColumns(input: CrimeReportInput) {
  return {
    office_id: input.officeId,
    cr_year: input.crYear,
    cr_seq: seqOf(input.crNumber),
    cr_number: input.crNumber,
    month: input.month,
    half_year: input.halfYear,
    offence_type_id: input.offenceTypeId,
    detection_date: input.detectionDate,
    place: input.place ?? null,
    police_area_id: input.policeAreaId ?? null,
    divisional_secretariat_id: input.divisionalSecretariatId ?? null,
    detecting_officer_id: input.detectingOfficerId ?? null,
    informant_id: input.informantId ?? null,
    ac_id: input.acId ?? null,
    sc_id: input.scId ?? null,
    oic_id: input.oicId ?? null,
    driver_id: input.driverId ?? null,
    notes: input.notes ?? null,
    quantity: input.quantity ?? null,
    quantity_extra: input.quantityExtra ?? null,
    over_quantity: input.overQuantity ?? null,
    cash_found_place: input.cashFoundPlace ?? null,
    cash_serials: input.cashSerials ?? null,
    cash_serials1: input.cashSerials1 ?? null,
    informant_help: input.informantHelp ?? null,
    informant_note2: input.informantNote2 ?? null,
    accused_note: input.accusedNote ?? null,
  };
}

const CHILD_TABLES = [
  'accused',
  'sureties',
  'detection_times',
  'cr_support_officers',
  'seized_items',
  'cash_notes',
  'productions',
] as const;

export class SqliteCrRepository implements CrRepository {
  constructor(private readonly db: DbHandle) {}

  private async writeChildren(crId: string, input: CrimeReportInput): Promise<void> {
    const q = this.db.q;
    for (const t of CHILD_TABLES)
      await q.deleteFrom(t).where('crime_report_id', '=', crId).execute();
    const at = now();
    const base = () => ({ ...created(this.db, undefined, at), crime_report_id: crId });

    const a = input.accused;
    await q
      .insertInto('accused')
      .values({
        ...base(),
        name: a.name,
        address: a.address ?? null,
        nic: a.nic ?? null,
        age: a.age ?? null,
        height: a.height ?? null,
        sex: a.sex ?? null,
        features: a.features ?? null,
        phone: a.phone ?? null,
        driving_licence_no: a.drivingLicenceNo ?? null,
        passport_no: a.passportNo ?? null,
      })
      .execute();
    if (input.surety) {
      const s = input.surety;
      await q
        .insertInto('sureties')
        .values({
          ...base(),
          name: s.name,
          address: s.address ?? null,
          nic: s.nic ?? null,
          phone: s.phone ?? null,
        })
        .execute();
    }
    if (input.times) {
      const t = input.times;
      await q
        .insertInto('detection_times')
        .values({
          ...base(),
          arrival: t.arrival ?? null,
          bc_leaving: t.bcLeaving ?? null,
          ipr_leaving: t.iprLeaving ?? null,
          detection: t.detection ?? null,
          after_detection: t.afterDetection ?? null,
        })
        .execute();
    }
    if (input.supportOfficers.length) {
      await q
        .insertInto('cr_support_officers')
        .values(
          input.supportOfficers.map((s) => ({
            ...base(),
            officer_id: s.officerId,
            position: s.position,
          })),
        )
        .execute();
    }
    if (input.seizedItems.length) {
      await q
        .insertInto('seized_items')
        .values(
          input.seizedItems.map((s, i) => ({
            ...base(),
            position: i,
            item_type: s.itemType,
            quantity: s.quantity,
            unit: s.unit,
            over_quantity: s.overQuantity ?? null,
          })),
        )
        .execute();
    }
    if (input.cashNotes.length) {
      await q
        .insertInto('cash_notes')
        .values(
          input.cashNotes.map((c, position) => ({
            ...base(),
            position,
            kind: c.kind,
            denomination: c.denomination,
            text: c.text,
          })),
        )
        .execute();
    }
    // Productions keep their slot (Production list / 1 / 2); empty slots are not stored.
    const productions = input.productions
      .map((description, position) => ({ description, position }))
      .filter((p) => p.description !== '');
    if (productions.length) {
      await q
        .insertInto('productions')
        .values(
          productions.map((p) => ({ ...base(), position: p.position, description: p.description })),
        )
        .execute();
    }
  }

  async insert(input: CrimeReportInput): Promise<CrimeReport> {
    const base = created(this.db);
    await this.db.transaction(async () => {
      await this.db.q
        .insertInto('crime_reports')
        .values({ ...base, ...headerColumns(input) })
        .execute();
      await this.writeChildren(base.id, input);
    });
    return (await this.getById(base.id))!;
  }

  async update(
    id: string,
    expectedVersion: number,
    input: CrimeReportInput,
  ): Promise<CrimeReport | null> {
    const changed = await this.db.transaction(async () => {
      const r = await this.db.q
        .updateTable('crime_reports')
        .set({
          ...headerColumns(input),
          updated_at: now(),
          updated_by: this.db.currentUser(),
          version: sql<number>`version + 1`,
        })
        .where('id', '=', id)
        .where('version', '=', expectedVersion)
        .executeTakeFirst();
      if (Number(r.numUpdatedRows) !== 1) return false;
      await this.writeChildren(id, input);
      return true;
    });
    return changed ? this.getById(id) : null;
  }

  async getById(id: string): Promise<CrimeReport | null> {
    return (await this.load([id]))[0] ?? null;
  }

  async findByNumber(
    officeId: string,
    crYear: number,
    crNumber: string,
  ): Promise<CrimeReport | null> {
    const row = await this.db.q
      .selectFrom('crime_reports')
      .select('id')
      .where('office_id', '=', officeId)
      .where('cr_year', '=', crYear)
      .where('cr_number', '=', crNumber)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row ? this.getById(row.id) : null;
  }

  async setDeleted(id: string, deleted: boolean): Promise<void> {
    const at = now();
    await this.db.q
      .updateTable('crime_reports')
      .set({
        deleted_at: deleted ? at : null,
        updated_at: at,
        updated_by: this.db.currentUser(),
        version: sql<number>`version + 1`,
      })
      .where('id', '=', id)
      .execute();
  }

  /** Loads whole CRs (with child rows) in the order of `ids`; missing ids are left out. */
  async load(ids: string[]): Promise<CrimeReport[]> {
    if (!ids.length) return [];
    const q = this.db.q;
    const out: CrimeReport[] = [];
    for (const part of chunks(ids)) {
      const [headers, accused, sureties, times, support, seized, cash, productions] =
        await Promise.all([
          q.selectFrom('crime_reports').selectAll().where('id', 'in', part).execute(),
          q.selectFrom('accused').selectAll().where('crime_report_id', 'in', part).execute(),
          q.selectFrom('sureties').selectAll().where('crime_report_id', 'in', part).execute(),
          q
            .selectFrom('detection_times')
            .selectAll()
            .where('crime_report_id', 'in', part)
            .execute(),
          q
            .selectFrom('cr_support_officers')
            .selectAll()
            .where('crime_report_id', 'in', part)
            .orderBy('position')
            .execute(),
          q
            .selectFrom('seized_items')
            .selectAll()
            .where('crime_report_id', 'in', part)
            .orderBy('position')
            .execute(),
          q
            .selectFrom('cash_notes')
            .selectAll()
            .where('crime_report_id', 'in', part)
            .orderBy('position')
            .execute(),
          q
            .selectFrom('productions')
            .selectAll()
            .where('crime_report_id', 'in', part)
            .orderBy('position')
            .execute(),
        ]);
      const byCr = <T extends { crime_report_id: string }>(rows: T[]) => {
        const m = new Map<string, T[]>();
        for (const r of rows) m.set(r.crime_report_id, [...(m.get(r.crime_report_id) ?? []), r]);
        return m;
      };
      const acc = byCr(accused);
      const sur = byCr(sureties);
      const tim = byCr(times);
      const sup = byCr(support);
      const sei = byCr(seized);
      const cas = byCr(cash);
      const pro = byCr(productions);
      const byId = new Map(headers.map((h) => [h.id, h]));
      for (const id of part) {
        const h = byId.get(id);
        if (!h) continue;
        out.push(
          this.toReport(h, {
            accused: acc.get(id)?.[0],
            surety: sur.get(id)?.[0],
            times: tim.get(id)?.[0],
            support: sup.get(id) ?? [],
            seized: sei.get(id) ?? [],
            cash: cas.get(id) ?? [],
            productions: pro.get(id) ?? [],
          }),
        );
      }
    }
    return out;
  }

  private toReport(
    h: CrimeReportsTable,
    c: {
      accused?: Record<string, unknown>;
      surety?: Record<string, unknown>;
      times?: Record<string, unknown>;
      support: { officer_id: string; position: number }[];
      seized: { item_type: string; quantity: number; unit: string; over_quantity: number | null }[];
      cash: { kind: string; denomination: number; text: string }[];
      productions: { position: number; description: string }[];
    },
  ): CrimeReport {
    const a = c.accused ?? {};
    const s = c.surety;
    const t = c.times;
    const productions: string[] = [];
    for (const p of c.productions) productions[p.position] = p.description;
    for (let i = 0; i < productions.length; i++) productions[i] ??= '';
    const report = {
      id: h.id,
      version: h.version,
      createdAt: h.created_at,
      updatedAt: h.updated_at,
      deleted: h.deleted_at !== null,
      ...compact({
        officeId: h.office_id,
        crYear: h.cr_year,
        crNumber: h.cr_number,
        month: h.month,
        halfYear: h.half_year,
        offenceTypeId: h.offence_type_id,
        detectionDate: h.detection_date,
        place: h.place,
        policeAreaId: h.police_area_id,
        divisionalSecretariatId: h.divisional_secretariat_id,
        detectingOfficerId: h.detecting_officer_id,
        informantId: h.informant_id,
        acId: h.ac_id,
        scId: h.sc_id,
        oicId: h.oic_id,
        driverId: h.driver_id,
        notes: h.notes,
        quantity: h.quantity,
        quantityExtra: h.quantity_extra,
        overQuantity: h.over_quantity,
        cashFoundPlace: h.cash_found_place,
        cashSerials: h.cash_serials,
        cashSerials1: h.cash_serials1,
        informantHelp: h.informant_help,
        informantNote2: h.informant_note2,
        accusedNote: h.accused_note,
      }),
      accused: compact({
        name: a.name,
        address: a.address,
        nic: a.nic,
        age: a.age,
        height: a.height,
        sex: a.sex,
        features: a.features,
        phone: a.phone,
        drivingLicenceNo: a.driving_licence_no,
        passportNo: a.passport_no,
      }),
      ...(s
        ? { surety: compact({ name: s.name, address: s.address, nic: s.nic, phone: s.phone }) }
        : {}),
      ...(t
        ? {
            times: compact({
              arrival: t.arrival,
              bcLeaving: t.bc_leaving,
              iprLeaving: t.ipr_leaving,
              detection: t.detection,
              afterDetection: t.after_detection,
            }),
          }
        : {}),
      supportOfficers: c.support.map((x) => ({ officerId: x.officer_id, position: x.position })),
      seizedItems: c.seized.map((x) =>
        compact({
          itemType: x.item_type,
          quantity: x.quantity,
          unit: x.unit,
          overQuantity: x.over_quantity,
        }),
      ),
      cashNotes: c.cash.map((x) => ({ kind: x.kind, denomination: x.denomination, text: x.text })),
      productions,
    };
    // Parsing checks the stored row still fits the shared schema the services rely on.
    return CrimeReport.parse(report);
  }
}
