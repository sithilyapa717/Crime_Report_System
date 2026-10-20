// Parameters for reference lists, users, audit, backup, files and printing (REMAINING_WORK §3.2).
// Checked at the IPC boundary before a service runs.
import { z } from 'zod';
import { IsoDate, Uuid } from './common.js';

/** The 14 lookup lists of the old `menu form4`, in the old order (REWRITE_PLAN §1.3). */
export const ReferenceKind = z.enum([
  'office',
  'year',
  'detecting_officer',
  'informant',
  'court',
  'prosecuting_officer',
  'offence',
  'divisional_secretariat',
  'support_officer',
  'ac',
  'sc',
  'oic',
  'driver',
  'police_area',
]);
export type ReferenceKind = z.infer<typeof ReferenceKind>;

/** Kinds stored in the one `officers` table (§4.1). */
export const OFFICER_KINDS = [
  'detecting_officer',
  'informant',
  'prosecuting_officer',
  'support_officer',
  'ac',
  'sc',
  'oic',
  'driver',
] as const satisfies readonly ReferenceKind[];

export const ReferenceInput = z.object({
  /** The name as staff type it (Sinhala or English); for `year`, the four-digit year. */
  value: z.string().trim().min(1).max(200),
  /** Offence code (`PUDS`, `UPG`, …); offences only, stored upper-case. */
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((s) => s.toUpperCase())
    .optional(),
  /** Officer rank (the old `Result` drop-downs carry it); officers only. */
  rank: z.string().trim().max(100).optional(),
});
export type ReferenceInput = z.infer<typeof ReferenceInput>;

export const AuditTable = z.enum([
  'crime_reports',
  'cases',
  'users',
  'reference_items',
  'files',
  'backups',
  'documents',
]);
export type AuditTable = z.infer<typeof AuditTable>;

export const AuditFilter = z.object({
  table: AuditTable.optional(),
  rowId: Uuid.optional(),
  userId: Uuid.optional(),
  /** Inclusive, local calendar dates. */
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  limit: z.number().int().min(1).max(1000).default(200),
});
export type AuditFilter = z.input<typeof AuditFilter>;

export const BackupSettingsInput = z.object({
  /** How many automatic backups to keep (oldest are removed first). */
  keep: z.number().int().min(1).max(365).optional(),
  dailyEnabled: z.boolean().optional(),
});
export type BackupSettingsInput = z.infer<typeof BackupSettingsInput>;

/** The name of one backup inside the backup folder; never a path. */
export const BackupName = z
  .string()
  .max(200)
  .regex(/^excise-backup-[\w.-]+$/)
  .refine((s) => !s.includes('..'), 'Invalid backup name');

/** Where a print layout goes: the printer dialog, or a PDF the user saves. */
export const PrintTarget = z.enum(['printer', 'pdf']);
export type PrintTarget = z.infer<typeof PrintTarget>;
