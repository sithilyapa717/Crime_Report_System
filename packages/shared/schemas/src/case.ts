import { z } from 'zod';
import { IsoDate, MoneyCents, Uuid } from './common.js';

export const CaseType = z.enum(['trial', 'warrant', 'summons']);
export type CaseType = z.infer<typeof CaseType>;

export const OutcomeType = z.enum([
  'fine',
  'community_service',
  'imprisonment',
  'suspended_sentence',
  'admonished',
  'settlement',
  'probation',
  'rehabilitation',
  'government_fee',
  'released',
  'acquitted',
  'remanded',
  'handed_to_court',
  'ag_advice',
]);
export type OutcomeType = z.infer<typeof OutcomeType>;

export const HearingInput = z.object({
  kind: CaseType,
  date: IsoDate,
  memo: z.string().optional(),
});

export const OutcomeInput = z.object({
  outcomeType: OutcomeType,
  convictedDate: IsoDate.optional(),
  fineAmount: MoneyCents.optional(),
  prisonMonths: z.number().int().nonnegative().optional(),
  prisonDays: z.number().int().nonnegative().optional(),
  receiptNo: z.string().optional(),
  receiptDate: IsoDate.optional(),
  addToConvictRegister: z.boolean().default(false),
});
export type OutcomeInput = z.infer<typeof OutcomeInput>;

export const CaseInput = z.object({
  crimeReportId: Uuid,
  courtId: Uuid,
  courtDate: IsoDate.optional(),
  prosecutingOfficerId: Uuid.optional(),
  caseNumber: z.string().optional(),
  caseType: CaseType.optional(),
  sithasi: z.boolean().default(false),
  permissionPending: z.boolean().default(false),
  withdrawn: z.boolean().default(false),
  accusedDied: z.boolean().default(false),
  /** Old form: summons date, warrant date and 21 hearing dates. */
  hearings: z.array(HearingInput).max(23).default([]),
  outcomes: z.array(OutcomeInput).default([]),
  rewardVoucherReceived: z.boolean().default(false),
  rewardVoucherDate: IsoDate.optional(),
  register: z
    .object({
      volumeNo: z.string().optional(),
      volumePage: z.string().optional(),
      indexPage: z.string().optional(),
      indexSn: z.string().optional(),
    })
    .optional(),
  handover: z
    .object({
      officer: z.string().optional(),
      location: z.string().optional(),
      date: IsoDate.optional(),
    })
    .optional(),
});
export type CaseInput = z.infer<typeof CaseInput>;

export const CaseRecord = CaseInput.extend({
  id: Uuid,
  version: z.number().int().positive(),
  updatedAt: z.string(),
});
export type CaseRecord = z.infer<typeof CaseRecord>;
