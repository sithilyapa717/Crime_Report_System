// Parameters for searches and reports. Checked at the IPC boundary before a service runs.
import { z } from 'zod';
import { IsoDate, Uuid } from './common.js';

const Year = z.number().int().min(1990).max(2100);
const Month = z.number().int().min(1).max(12);
const ShortText = z.string().max(200);

export const CrSearchFilter = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('year'), officeId: Uuid, year: Year }),
  z.object({ kind: z.literal('court_date'), officeId: Uuid, date: IsoDate }),
  z.object({ kind: z.literal('detection_date'), officeId: Uuid, date: IsoDate }),
  z.object({ kind: z.literal('court_case'), courtId: Uuid, caseNumber: ShortText }),
  /** Name is a partial, case-insensitive match; NIC is exact. */
  z.object({ kind: z.literal('name_nic'), name: ShortText.optional(), nic: ShortText.optional() }),
]);
export type CrSearchFilter = z.infer<typeof CrSearchFilter>;

export const ConvictFilter = z.object({
  officeId: Uuid.optional(),
  year: Year.optional(),
  month: Month.optional(),
  name: ShortText.optional(),
  nic: ShortText.optional(),
  courtId: Uuid.optional(),
});
export type ConvictFilter = z.infer<typeof ConvictFilter>;

export const PreviousOffenceQuery = z.object({
  name: ShortText.optional(),
  nic: ShortText.optional(),
  courtId: Uuid.optional(),
});
export type PreviousOffenceQuery = z.infer<typeof PreviousOffenceQuery>;

export const ReportScope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('year'), officeId: Uuid, year: Year }),
  z.object({ kind: z.literal('month'), officeId: Uuid, year: Year, month: Month }),
  /** Uses the half chosen at data entry (open question 6). */
  z.object({
    kind: z.literal('half_year'),
    officeId: Uuid,
    year: Year,
    half: z.enum(['first', 'second']),
  }),
]);
export type ReportScope = z.infer<typeof ReportScope>;

export const ReportPerson = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.enum(['detecting_officer', 'informant']), officerId: Uuid }),
]);
export type ReportPerson = z.infer<typeof ReportPerson>;

export const ReportType = z.enum([
  'register',
  'warrant',
  'trial',
  'summons',
  'not_filed',
  'fines_not_collected',
  'rewards_due',
  'resolved',
  'fines_earned',
  'convicts',
]);
export type ReportType = z.infer<typeof ReportType>;

export const ReportParams = z.object({
  scope: ReportScope,
  person: ReportPerson,
  type: ReportType,
});
export type ReportParams = z.infer<typeof ReportParams>;

export const SummaryGroupBy = z.enum(['offence', 'detecting_officer', 'informant']);
export type SummaryGroupBy = z.infer<typeof SummaryGroupBy>;

export const ExportFormat = z.enum(['xlsx', 'csv']);
export type ExportFormat = z.infer<typeof ExportFormat>;
