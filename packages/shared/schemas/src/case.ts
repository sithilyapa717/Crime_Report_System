import { z } from 'zod';
import { IsoDate, MoneyCents, Uuid } from './common.js';

export const CaseType = z.enum(['trial', 'warrant', 'summons']);

export const OutcomeType = z.enum([
  'fine', 'community_service', 'imprisonment', 'suspended_sentence', 'admonished',
  'settlement', 'probation', 'rehabilitation', 'government_fee', 'released', 'acquitted',
  'remanded', 'handed_to_court', 'ag_advice',
]);

export const HearingInput = z.object({
  kind: z.enum(['trial', 'warrant', 'summons']),
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
  hearings: z.array(HearingInput).max(23).default([]),
  outcomes: z.array(OutcomeInput).default([]),
  rewardVoucherReceived: z.boolean().default(false),
  register: z
    .object({ volumeNo: z.string().optional(), volumePage: z.string().optional(), indexPage: z.string().optional(), indexSn: z.string().optional() })
    .optional(),
});
export type CaseInput = z.infer<typeof CaseInput>;
