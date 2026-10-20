// The CR entry form's working copy and its conversion to and from the service's CrimeReportInput.
// The form keeps every field as the user left it; `toInput` drops empty values, and the service
// validates (its field issues come back onto the form).
import type { CaseInput, CaseRecord, CrimeReport, CrimeReportInput } from '@excise/schemas';

type Input = CrimeReportInput;
type Accused = Input['accused'];
type Surety = NonNullable<Input['surety']>;
type Times = NonNullable<Input['times']>;
export type SeizedType = Input['seizedItems'][number]['itemType'];
export type Denomination = Input['cashNotes'][number]['denomination'];

/** sp1–sp15 in the old order, with their units (§1.4). */
export const SEIZED: { type: SeizedType; unit: string }[] = [
  { type: 'spirit', unit: 'L' },
  { type: 'kasippu', unit: 'L' },
  { type: 'goda', unit: 'L' },
  { type: 'state_arrack', unit: 'L' },
  { type: 'beer', unit: 'L' },
  { type: 'foreign_liquor', unit: 'L' },
  { type: 'cigarettes', unit: 'pcs' },
  { type: 'beedi', unit: 'pcs' },
  { type: 'cannabis', unit: 'g' },
  { type: 'cannabis_plants', unit: 'pcs' },
  { type: 'heroin', unit: 'mg' },
  { type: 'tablets', unit: 'pcs' },
  { type: 'cannabis_mixture', unit: 'g' },
  { type: 'toddy', unit: 'L' },
  { type: 'ice', unit: 'mg' },
];

export const DENOMINATIONS: Denomination[] = [5000, 1000, 500, 100, 50, 20, 10];

export interface CrDraft {
  officeId?: string;
  crYear?: number;
  /** The running number part of `n/yyyy`. */
  crSeq?: number;
  month?: number;
  halfYear?: 'first' | 'second';
  offenceTypeId?: string;
  detectionDate?: string;
  place: string;
  policeAreaId?: string;
  divisionalSecretariatId?: string;
  detectingOfficerId?: string;
  informantId?: string;
  acId?: string;
  scId?: string;
  oicId?: string;
  driverId?: string;
  notes: string;
  informantHelp: string;
  informantNote2: string;
  accusedNote: string;
  quantity?: number;
  quantityExtra?: number;
  overQuantity?: number;
  cashFoundPlace: string;
  cashSerials: string;
  cashSerials1: string;
  accused: {
    name: string;
    address: string;
    nic: string;
    age: number | undefined;
    height: string;
    sex: 'male' | 'female' | undefined;
    features: string;
    phone: string;
    drivingLicenceNo: string;
    passportNo: string;
  };
  surety: { [K in keyof Surety]-?: string };
  times: { [K in keyof Times]-?: string };
  /** position 1–10 → officer id */
  support: Record<number, string | undefined>;
  /** item type → quantity / over quantity */
  seized: Partial<Record<SeizedType, { quantity?: number; overQuantity?: number }>>;
  /** `used:1000` → note serials text */
  cash: Record<string, string>;
  productions: [string, string, string];
  /** The Court tab: saved to the CR's case. */
  courtId?: string;
  courtDate?: string;
  prosecutingOfficerId?: string;
}

export function emptyDraft(defaults: Partial<CrDraft> = {}): CrDraft {
  const now = new Date();
  return {
    crYear: now.getFullYear(),
    month: now.getMonth() + 1,
    halfYear: now.getMonth() < 6 ? 'first' : 'second',
    place: '',
    notes: '',
    informantHelp: '',
    informantNote2: '',
    accusedNote: '',
    cashFoundPlace: '',
    cashSerials: '',
    cashSerials1: '',
    accused: {
      name: '',
      address: '',
      nic: '',
      age: undefined,
      height: '',
      sex: undefined,
      features: '',
      phone: '',
      drivingLicenceNo: '',
      passportNo: '',
    },
    surety: { name: '', address: '', nic: '', phone: '' },
    times: { arrival: '', bcLeaving: '', iprLeaving: '', detection: '', afterDetection: '' },
    support: {},
    seized: {},
    cash: {},
    productions: ['', '', ''],
    ...defaults,
  };
}

const t = (s: string | undefined) => (s && s.trim() !== '' ? s.trim() : undefined);

/** Drops empty strings (and objects that end up empty). */
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const val = typeof v === 'string' ? t(v) : v;
    if (val !== undefined) out[k] = val;
  }
  return out as Partial<T>;
}

/** The body for cr.create / cr.update (may be incomplete: the service reports what is missing). */
export function toInput(d: CrDraft): Input {
  const surety = compact(d.surety);
  const times = compact(d.times);
  const productions = d.productions.map((p) => p.trim());
  while (productions.length && productions[productions.length - 1] === '') productions.pop();
  return {
    ...compact({
      officeId: d.officeId,
      crYear: d.crYear,
      crNumber:
        d.crSeq !== undefined && d.crYear !== undefined ? `${d.crSeq}/${d.crYear}` : undefined,
      month: d.month,
      halfYear: d.halfYear,
      offenceTypeId: d.offenceTypeId,
      detectionDate: d.detectionDate,
      place: d.place,
      policeAreaId: d.policeAreaId,
      divisionalSecretariatId: d.divisionalSecretariatId,
      detectingOfficerId: d.detectingOfficerId,
      informantId: d.informantId,
      acId: d.acId,
      scId: d.scId,
      oicId: d.oicId,
      driverId: d.driverId,
      notes: d.notes,
      informantHelp: d.informantHelp,
      informantNote2: d.informantNote2,
      accusedNote: d.accusedNote,
      quantity: d.quantity,
      quantityExtra: d.quantityExtra,
      overQuantity: d.overQuantity,
      cashFoundPlace: d.cashFoundPlace,
      cashSerials: d.cashSerials,
      cashSerials1: d.cashSerials1,
    }),
    accused: { name: d.accused.name.trim(), ...compact(d.accused) } as Accused,
    ...(surety.name ? { surety: surety as Surety } : {}),
    ...(Object.keys(times).length ? { times: times as Times } : {}),
    supportOfficers: Object.entries(d.support)
      .filter((e): e is [string, string] => !!e[1])
      .map(([position, officerId]) => ({ officerId, position: Number(position) })),
    seizedItems: SEIZED.flatMap(({ type, unit }) => {
      const s = d.seized[type];
      return s?.quantity !== undefined
        ? [
            {
              itemType: type,
              quantity: s.quantity,
              unit,
              ...(s.overQuantity !== undefined ? { overQuantity: s.overQuantity } : {}),
            },
          ]
        : [];
    }),
    cashNotes: Object.entries(d.cash)
      .filter(([, text]) => text.trim() !== '')
      .map(([key, text]) => {
        const [kind, denomination] = key.split(':');
        return {
          kind: kind as 'used' | 'left',
          denomination: Number(denomination) as Denomination,
          text: text.trim(),
        };
      }),
    productions,
  } as Input;
}

export function fromReport(cr: CrimeReport, c: CaseInput | null): CrDraft {
  const support: CrDraft['support'] = {};
  for (const s of cr.supportOfficers) support[s.position] = s.officerId;
  const seized: CrDraft['seized'] = {};
  for (const s of cr.seizedItems)
    seized[s.itemType] = { quantity: s.quantity, overQuantity: s.overQuantity };
  const cash: CrDraft['cash'] = {};
  for (const n of cr.cashNotes) cash[`${n.kind}:${n.denomination}`] = n.text;
  const a = cr.accused;
  return emptyDraft({
    officeId: cr.officeId,
    crYear: cr.crYear,
    crSeq: Number(cr.crNumber.split('/')[0]),
    month: cr.month,
    halfYear: cr.halfYear,
    offenceTypeId: cr.offenceTypeId,
    detectionDate: cr.detectionDate,
    place: cr.place ?? '',
    policeAreaId: cr.policeAreaId,
    divisionalSecretariatId: cr.divisionalSecretariatId,
    detectingOfficerId: cr.detectingOfficerId,
    informantId: cr.informantId,
    acId: cr.acId,
    scId: cr.scId,
    oicId: cr.oicId,
    driverId: cr.driverId,
    notes: cr.notes ?? '',
    informantHelp: cr.informantHelp ?? '',
    informantNote2: cr.informantNote2 ?? '',
    accusedNote: cr.accusedNote ?? '',
    quantity: cr.quantity,
    quantityExtra: cr.quantityExtra,
    overQuantity: cr.overQuantity,
    cashFoundPlace: cr.cashFoundPlace ?? '',
    cashSerials: cr.cashSerials ?? '',
    cashSerials1: cr.cashSerials1 ?? '',
    accused: {
      name: a.name,
      address: a.address ?? '',
      nic: a.nic ?? '',
      age: a.age,
      height: a.height ?? '',
      sex: a.sex,
      features: a.features ?? '',
      phone: a.phone ?? '',
      drivingLicenceNo: a.drivingLicenceNo ?? '',
      passportNo: a.passportNo ?? '',
    },
    surety: {
      name: cr.surety?.name ?? '',
      address: cr.surety?.address ?? '',
      nic: cr.surety?.nic ?? '',
      phone: cr.surety?.phone ?? '',
    },
    times: {
      arrival: cr.times?.arrival ?? '',
      bcLeaving: cr.times?.bcLeaving ?? '',
      iprLeaving: cr.times?.iprLeaving ?? '',
      detection: cr.times?.detection ?? '',
      afterDetection: cr.times?.afterDetection ?? '',
    },
    support,
    seized,
    cash,
    productions: [cr.productions[0] ?? '', cr.productions[1] ?? '', cr.productions[2] ?? ''],
    courtId: c?.courtId,
    courtDate: c?.courtDate,
    prosecutingOfficerId: c?.prosecutingOfficerId,
  });
}

/** Which tab shows a field from the service's issue path (`accused.name`, `cashNotes.0.text`…). */
export function tabOf(field: string): string {
  const f = field.split('.')[0]!;
  if (f === 'accused' || f === 'accusedNote') return 'accused';
  if (f === 'surety') return 'surety';
  if (f === 'times') return 'times';
  if (f === 'cashNotes' || f.startsWith('cash')) return 'cash';
  if (
    f === 'seizedItems' ||
    f.startsWith('quantity') ||
    f === 'overQuantity' ||
    f === 'productions'
  )
    return 'seized';
  if (f === 'courtId' || f === 'courtDate' || f === 'prosecutingOfficerId') return 'court';
  if (['officeId', 'crYear', 'crNumber', 'month', 'halfYear'].includes(f)) return 'header';
  return 'detection';
}

/** A saved case without its record fields, ready to send back to case.save. */
export function caseBody(c: CaseRecord): CaseInput {
  const { id, version, updatedAt, ...body } = c;
  void id;
  void version;
  void updatedAt;
  return body;
}

/** A new, empty case for a CR. */
export function newCase(crimeReportId: string, courtId: string): CaseInput {
  return {
    crimeReportId,
    courtId,
    sithasi: false,
    permissionPending: false,
    withdrawn: false,
    accusedDied: false,
    hearings: [],
    outcomes: [],
    rewardVoucherReceived: false,
  };
}
