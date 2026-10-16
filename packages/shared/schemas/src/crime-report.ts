import { z } from 'zod';
import { CrNumber, IsoDate, MoneyCents, Nic, TimeOfDay, Uuid } from './common.js';

export const HalfYear = z.enum(['first', 'second']);
export const Sex = z.enum(['male', 'female']);

export const SeizedItemType = z.enum([
  'spirit', 'kasippu', 'goda', 'state_arrack', 'beer', 'foreign_liquor', 'cigarettes',
  'beedi', 'cannabis', 'cannabis_plants', 'heroin', 'tablets', 'cannabis_mixture', 'toddy', 'ice',
]);

export const AccusedInput = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  nic: Nic.optional(),
  age: z.number().int().min(0).max(130).optional(),
  height: z.string().optional(),
  sex: Sex.optional(),
  features: z.string().optional(),
  phone: z.string().optional(),
  drivingLicenceNo: z.string().optional(),
  passportNo: z.string().optional(),
});

export const SuretyInput = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  nic: Nic.optional(),
  phone: z.string().optional(),
});

export const DetectionTimesInput = z.object({
  arrival: TimeOfDay.optional(),
  bcLeaving: TimeOfDay.optional(),
  iprLeaving: TimeOfDay.optional(),
  detection: TimeOfDay.optional(),
  afterDetection: TimeOfDay.optional(),
});

export const SeizedItemInput = z.object({
  itemType: SeizedItemType,
  quantity: z.number().nonnegative(),
  unit: z.string(),
  overQuantity: z.number().nonnegative().optional(),
});

export const CashNoteInput = z.object({
  kind: z.enum(['used', 'left']),
  denomination: z.number().int().positive(),
  count: z.number().int().nonnegative(),
  foundPlace: z.string().optional(),
});

/** Support officer slot 1-10 (dh1-dh5, inh1-inh5). */
export const SupportOfficerInput = z.object({
  officerId: Uuid,
  position: z.number().int().min(1).max(10),
});

export const CrimeReportInput = z.object({
  officeId: Uuid,
  crYear: z.number().int().min(1990).max(2100),
  crNumber: CrNumber,
  month: z.number().int().min(1).max(12),
  halfYear: HalfYear,
  offenceTypeId: Uuid,
  detectionDate: IsoDate,
  place: z.string().optional(),
  policeAreaId: Uuid.optional(),
  divisionalSecretariatId: Uuid.optional(),
  detectingOfficerId: Uuid.optional(),
  informantId: Uuid.optional(),
  acId: Uuid.optional(),
  scId: Uuid.optional(),
  oicId: Uuid.optional(),
  driverId: Uuid.optional(),
  notes: z.string().optional(),
  accused: AccusedInput,
  surety: SuretyInput.optional(),
  times: DetectionTimesInput.optional(),
  supportOfficers: z.array(SupportOfficerInput).max(10).default([]),
  seizedItems: z.array(SeizedItemInput).default([]),
  cashNotes: z.array(CashNoteInput).default([]),
  productions: z.array(z.string()).default([]),
});
export type CrimeReportInput = z.infer<typeof CrimeReportInput>;

export const CrimeReport = CrimeReportInput.extend({
  id: Uuid,
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deleted: z.boolean().default(false),
});
export type CrimeReport = z.infer<typeof CrimeReport>;

export { MoneyCents };
