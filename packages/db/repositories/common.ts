// Helpers shared by the SQLite repositories.
import { randomUUID } from 'node:crypto';
import type { ReferenceKind } from '@excise/schemas';
import type { DbHandle } from '../src/handle.js';

export const now = () => new Date().toISOString();
export const newId = () => randomUUID();
export const flag = (b: boolean | undefined) => (b ? 1 : 0);

/** The sync columns for a new row. */
export function created(db: DbHandle, id: string = newId(), at: string = now()) {
  return {
    id,
    created_at: at,
    updated_at: at,
    updated_by: db.currentUser(),
    version: 1,
    deleted_at: null,
  };
}

/** Removes `null` values, so optional schema fields come back as absent, as the services expect. */
export function compact<T extends Record<string, unknown>>(
  row: T,
): { [K in keyof T]: Exclude<T[K], null> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined) out[k] = v;
  return out as { [K in keyof T]: Exclude<T[K], null> };
}

export type ListTable =
  | 'offices'
  | 'years'
  | 'offence_types'
  | 'officers'
  | 'courts'
  | 'police_areas'
  | 'divisional_secretariats';

/** Which table holds each of the 14 lists; officers share one table with a `kind`. */
export function listTable(kind: ReferenceKind): ListTable {
  switch (kind) {
    case 'office':
      return 'offices';
    case 'year':
      return 'years';
    case 'offence':
      return 'offence_types';
    case 'court':
      return 'courts';
    case 'police_area':
      return 'police_areas';
    case 'divisional_secretariat':
      return 'divisional_secretariats';
    default:
      return 'officers';
  }
}

/** Splits a long id list for `IN (…)` (SQLite allows 32k parameters; stay well below). */
export function chunks<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
