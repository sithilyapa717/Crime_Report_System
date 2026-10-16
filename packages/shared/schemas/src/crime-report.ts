import { z } from 'zod';
import { CrNumber, IsoDate, MoneyCents, Nic, Uuid } from './common.js';

/** Text exactly as staff typed it; never reformatted. */
const TypedText = z.string().max(500);

export const HalfYear = z.enum(['first', 'second']);
export const Sex = z.enum(['male', 'female']);

export const SeizedItemType = z.enum([
  'spirit',
  'kasippu',
  'goda',
  'state_arrack',
  'beer',
  'foreign_liquor',
  'cigarettes',
  'beedi',
  'cannabis',
  'cannabis_plants',
  'heroin',
  'tablets',
  'cannabis_mixture',
  'toddy',
  'ice',
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

/** Free text in Access with no agreed format (e.g. 14.45 or 14:45), so kept as typed. */
export const DetectionTimesInput = z.object({
  arrival: TypedText.optional(),
  bcLeaving: TypedText.optional(),
  iprLeaving: TypedText.optional(),
  detection: TypedText.optional(),
  afterDetection: TypedText.optional(),
});

export const SeizedItemInput = z.object({
  itemType: SeizedItemType,
  quantity: z.number().nonnegative(),
  unit: z.string(),
  overQuantity: z.number().nonnegative().optional(),
});

export const CashDenomination = z.union([
  z.literal(5000),
  z.literal(1000),
  z.literal(500),
  z.literal(100),
  z.literal(50),
  z.literal(20),
  z.literal(10),
]);

/**
 * One of the 14 cash boxes on the old form: `Cash 5000`..`Cash 10` (notes used) and
 * `Cash1 5000`..`Cash7 10` (notes left). They were Text in Access and staff typed the note
 * serial numbers into them (e.g. "S/426 672487"), so the value is kept as typed.
 */
export const CashNoteInput = z.object({
  kind: z.enum(['used', 'left']),
  denomination: CashDenomination,
  text: TypedText,
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
  /** `Quantity`, `Quantity1`, `Over Quantity`: whole numbers (Long Integer in Access). */
  quantity: z.number().int().nonnegative().optional(),
  quantityExtra: z.number().int().nonnegative().optional(),
  overQuantity: z.number().int().nonnegative().optional(),
  /** `place of cash`: where the decoy cash was found. */
  cashFoundPlace: TypedText.optional(),
  /** Serial numbers of the decoy notes (`Cash Number`, `Cash Number 1`). */
  cashSerials: z.string().optional(),
  cashSerials1: z.string().optional(),
  /** `infor help` / `infor 2` / `Accused note`. */
  informantHelp: z.string().optional(),
  informantNote2: z.string().optional(),
  accusedNote: z.string().optional(),
  accused: AccusedInput,
  surety: SuretyInput.optional(),
  times: DetectionTimesInput.optional(),
  supportOfficers: z.array(SupportOfficerInput).max(10).default([]),
  seizedItems: z.array(SeizedItemInput).default([]),
  cashNotes: z
    .array(CashNoteInput)
    .max(14)
    .refine(
      (notes) => new Set(notes.map((n) => `${n.kind}:${n.denomination}`)).size === notes.length,
      'One entry per cash box',
    )
    .default([]),
  /** [0] = `Production list`, [1] = `Production1`, [2] = `Production2`. */
  productions: z.array(TypedText).max(3).default([]),
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
