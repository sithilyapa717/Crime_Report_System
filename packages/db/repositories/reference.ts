// A11: the 14 lookup lists (seven tables; officers share one table with a `kind`).
import type { ReferenceItem, ReferenceLookup, ReferenceRepository } from '@excise/contract';
import type { ReferenceInput, ReferenceKind } from '@excise/schemas';
import { sql } from 'kysely';
import type { DbHandle } from '../src/handle.js';
import { created, listTable, now } from './common.js';

interface ViewRow {
  id: string;
  kind: string;
  value: string;
  code: string | null;
  rank: string | null;
  active: number;
}

const toItem = (r: ViewRow): ReferenceItem => ({
  id: r.id,
  kind: r.kind as ReferenceKind,
  value: r.value,
  code: r.code,
  rank: r.rank,
  active: r.active === 1,
});

export class SqliteReferenceRepository implements ReferenceRepository {
  constructor(private readonly db: DbHandle) {}

  private view() {
    return this.db.q
      .selectFrom(sql<ViewRow & { deleted_at: string | null }>`v_reference_items`.as('v'))
      .select(['v.id', 'v.kind', 'v.value', 'v.code', 'v.rank', 'v.active'])
      .where('v.deleted_at', 'is', null);
  }

  async list(kind: ReferenceKind, includeInactive: boolean): Promise<ReferenceItem[]> {
    let q = this.view().where('v.kind', '=', kind);
    if (!includeInactive) q = q.where('v.active', '=', 1);
    const rows = await q.execute();
    return rows.map(toItem).sort((a, b) => a.value.localeCompare(b.value));
  }

  async getById(id: string): Promise<ReferenceItem | null> {
    const row = await this.view().where('v.id', '=', id).executeTakeFirst();
    return row ? toItem(row) : null;
  }

  async findByValue(kind: ReferenceKind, value: string): Promise<ReferenceItem | null> {
    const wanted = value.trim().toLocaleLowerCase();
    // Lists are short; compare in JS so non-ASCII text folds the same way as everywhere else.
    const rows = await this.view().where('v.kind', '=', kind).execute();
    const hit = rows.find((r) => r.value.trim().toLocaleLowerCase() === wanted);
    return hit ? toItem(hit) : null;
  }

  async insert(kind: ReferenceKind, input: ReferenceInput, active = true): Promise<ReferenceItem> {
    const base = { ...created(this.db), active: active ? 1 : 0 };
    const table = listTable(kind);
    if (table === 'offence_types') {
      await this.db.q
        .insertInto('offence_types')
        .values({
          ...base,
          code: input.code ?? input.value,
          name_si: input.value,
          template_group: input.code ?? null,
        })
        .execute();
    } else if (table === 'officers') {
      await this.db.q
        .insertInto('officers')
        .values({ ...base, kind, name: input.value, rank: input.rank ?? null })
        .execute();
    } else {
      await this.db.q
        .insertInto(table)
        .values({ ...base, name: input.value })
        .execute();
    }
    return (await this.getById(base.id))!;
  }

  async update(id: string, input: ReferenceInput): Promise<ReferenceItem | null> {
    const item = await this.getById(id);
    if (!item) return null;
    const table = listTable(item.kind);
    const sync = {
      updated_at: now(),
      updated_by: this.db.currentUser(),
      version: sql<number>`version + 1`,
    };
    if (table === 'offence_types') {
      await this.db.q
        .updateTable('offence_types')
        .set({ ...sync, name_si: input.value, ...(input.code ? { code: input.code } : {}) })
        .where('id', '=', id)
        .execute();
    } else if (table === 'officers') {
      await this.db.q
        .updateTable('officers')
        .set({ ...sync, name: input.value, rank: input.rank ?? null })
        .where('id', '=', id)
        .execute();
    } else {
      await this.db.q
        .updateTable(table)
        .set({ ...sync, name: input.value })
        .where('id', '=', id)
        .execute();
    }
    return this.getById(id);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const item = await this.getById(id);
    if (!item) return;
    await this.db.q
      .updateTable(listTable(item.kind))
      .set({
        active: active ? 1 : 0,
        updated_at: now(),
        updated_by: this.db.currentUser(),
        version: sql<number>`version + 1`,
      })
      .where('id', '=', id)
      .execute();
  }

  async delete(id: string): Promise<void> {
    const item = await this.getById(id);
    if (item) await this.db.q.deleteFrom(listTable(item.kind)).where('id', '=', id).execute();
  }

  /**
   * CRs (deleted ones too: they can be restored) whose header, support officers or case point at
   * the item. An item with any use cannot be deleted, only deactivated.
   */
  async usageCount(id: string): Promise<number> {
    const row = await sql<{ n: number }>`
      SELECT COUNT(DISTINCT cr.id) AS n
      FROM crime_reports cr
      LEFT JOIN cases c ON c.crime_report_id = cr.id
      WHERE ${id} IN (cr.office_id, cr.offence_type_id, cr.police_area_id, cr.divisional_secretariat_id,
                      cr.detecting_officer_id, cr.informant_id, cr.ac_id, cr.sc_id, cr.oic_id, cr.driver_id,
                      c.court_id, c.prosecuting_officer_id)
         OR EXISTS (SELECT 1 FROM cr_support_officers s WHERE s.crime_report_id = cr.id AND s.officer_id = ${id})
    `.execute(this.db.q);
    // PostgreSQL returns COUNT as a bigint string.
    return Number(row.rows[0]?.n ?? 0);
  }
}

export class SqliteReferenceLookup implements ReferenceLookup {
  constructor(private readonly refs: SqliteReferenceRepository) {}

  async name(id: string): Promise<string | null> {
    return (await this.refs.getById(id))?.value ?? null;
  }

  async offence(id: string): Promise<{ code: string; nameSi: string } | null> {
    const item = await this.refs.getById(id);
    return item?.kind === 'offence' && item.code ? { code: item.code, nameSi: item.value } : null;
  }
}
