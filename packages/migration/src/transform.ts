// One row of the legacy `Office` table → a CR and its case (REWRITE_PLAN §7, §11).
// Reference names are collected first and turned into ids later (`build`), so a dry run and a
// real run share this code. A value that cannot be read goes to the exceptions report and its raw
// text is kept in the CR's notes, so it is never guessed and never lost.
import type { ImportException } from '@excise/contract';
import { CaseInput, CrimeReportInput, type OutcomeType, type ReferenceKind } from '@excise/schemas';
import {
  CASH_LEFT,
  CASH_USED,
  DENOMINATIONS,
  HEARINGS,
  normalizeColumn,
  OUTCOME_FLAGS,
  SEIZED,
} from './columns.js';
import {
  isBlank,
  parseCrNumber,
  parseDate,
  parseFlag,
  parseHalfYear,
  parseMoneyCents,
  parseMonth,
  parseNic,
  parseNumber,
  parseSex,
  parseWholeNumber,
  text,
  type Parsed,
} from './parse.js';

export interface RefName {
  kind: ReferenceKind;
  value: string;
  /** Offences: the code (the legacy `Offence` column holds the code). */
  code?: string;
}

/** Offences are matched by code, everything else by name (case-insensitive). */
export const refKey = (r: RefName) =>
  r.kind === 'offence' && r.code
    ? `offence\u0000#${r.code.toUpperCase()}`
    : `${r.kind}\u0000${r.value.toLocaleLowerCase()}`;

export interface RowDraft {
  /** CR number as read, or `row N` when there is none. */
  label: string;
  crNumber: string;
  crYear: number;
  refs: RefName[];
  /** Fills in reference ids; returns the CR and case to save, or the schema problems. */
  build(idOf: (r: RefName) => string): {
    cr: CrimeReportInput | null;
    case: Omit<CaseInput, 'crimeReportId'> | null;
    issues: ImportException[];
  };
  /** For the totals (A14). */
  offenceCode: string;
  quantity: number | null;
  fineCents: number | null;
}

type Row = Record<string, unknown>;

/** Reads columns by normalised name. */
export function rowReader(row: Row) {
  const byName = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) byName.set(normalizeColumn(k), v);
  return (column: string): unknown => byName.get(normalizeColumn(column));
}

export function transformRow(
  row: Row,
  index: number,
  exceptions: ImportException[],
): RowDraft | null {
  const get = rowReader(row);
  const rawCr = text(get('CR NO 2017'));
  const label = rawCr ?? `row ${index + 1}`;
  const kept: string[] = [];
  const ex = (column: string, reason: ImportException['reason'], value: unknown = get(column)) => {
    exceptions.push({
      row: label,
      column,
      value: value === undefined || value === null ? '' : String(value),
      reason,
    });
  };
  /** Parse an optional column; on failure, report it and keep the raw text in the notes. */
  const opt = <T>(
    column: string,
    parse: (v: unknown) => Parsed<T>,
    reason: ImportException['reason'],
  ) => {
    const v = get(column);
    if (isBlank(v)) return undefined;
    const p = parse(v);
    if (p.ok) return p.value;
    ex(column, reason);
    kept.push(`${column}: ${String(v).trim()}`);
    return undefined;
  };
  /** A required column: on failure the row is skipped. */
  let skip = false;
  const req = <T>(
    column: string,
    parse: (v: unknown) => Parsed<T>,
    reason: ImportException['reason'],
  ) => {
    const v = get(column);
    if (isBlank(v)) {
      ex(column, 'missing_required');
      skip = true;
      return undefined;
    }
    const p = parse(v);
    if (p.ok) return p.value;
    ex(column, reason);
    skip = true;
    return undefined;
  };
  const ref = (kind: ReferenceKind, column: string): RefName | undefined => {
    const value = text(get(column));
    return value ? { kind, value } : undefined;
  };

  // ---- Header ----
  const yearCol = get('YearCR');
  const yearCR = isBlank(yearCol) ? undefined : parseWholeNumber(yearCol);
  if (yearCR && !yearCR.ok) ex('YearCR', 'bad_number');
  const number = req(
    'CR NO 2017',
    (v) => parseCrNumber(v, yearCR?.ok ? yearCR.value : undefined),
    'bad_cr_number',
  );
  const officeName = text(get('office'));
  if (!officeName) {
    ex('office', 'missing_required');
    skip = true;
  }
  const offenceCode = text(get('Offence'))?.toUpperCase();
  if (!offenceCode) {
    ex('Offence', 'missing_required');
    skip = true;
  }
  const month = req('month', parseMonth, 'other');
  const halfYear = req('fistsecon', parseHalfYear, 'other');
  const detectionDate = req('Date of Detection', parseDate, 'bad_date');
  const accusedName = text(get('Name of Accused'));
  if (!accusedName) {
    ex('Name of Accused', 'missing_required');
    skip = true;
  }
  if (
    skip ||
    !number ||
    !officeName ||
    !offenceCode ||
    !month ||
    !halfYear ||
    !detectionDate ||
    !accusedName
  ) {
    return null;
  }

  // ---- References ----
  const office: RefName = { kind: 'office', value: officeName };
  const offence: RefName = { kind: 'offence', value: offenceCode, code: offenceCode };
  const officers = {
    policeAreaId: ref('police_area', 'polise unit'),
    divisionalSecretariatId: ref('divisional_secretariat', 'prale name'),
    detectingOfficerId: ref('detecting_officer', 'detection officer'),
    informantId: ref('informant', 'Informan'),
    acId: ref('ac', 'Ac'),
    scId: ref('sc', 'Sc'),
    oicId: ref('oic', 'oic'),
    driverId: ref('driver', 'Drive'),
  };
  const support = [
    ...['dh1', 'dh2', 'dh3', 'dh4', 'dh5'].map((c, i) => ({
      position: i + 1,
      r: ref('support_officer', c),
    })),
    ...['inh1', 'inh2', 'inh3', 'inh4', 'inh5'].map((c, i) => ({
      position: i + 6,
      r: ref('support_officer', c),
    })),
  ].filter((s): s is { position: number; r: RefName } => !!s.r);

  // ---- Accused, surety, times ----
  const accused = {
    name: accusedName,
    address: text(get('Address of Accused')),
    nic: opt('NIC No of Accused', parseNic, 'bad_nic'),
    age: opt(
      'Age',
      (v) => {
        const n = parseWholeNumber(v);
        return n.ok && n.value <= 130 ? n : { ok: false };
      },
      'bad_number',
    ),
    height: text(get('Hight')),
    sex: opt('male female', parseSex, 'other'),
    features: text(get('Accused details')),
    phone: text(get('deno')),
    drivingLicenceNo: text(get('driveno')),
    passportNo: text(get('forinno')),
  };
  const suretyName = text(get('Name of Suerty'));
  const surety = suretyName
    ? {
        name: suretyName,
        address: text(get('Address of Suerty')),
        nic: opt('NIC Suerty', parseNic, 'bad_nic'),
        phone: text(get('beno')),
      }
    : undefined;
  if (!suretyName) {
    for (const c of ['Address of Suerty', 'NIC Suerty', 'beno']) {
      if (!isBlank(get(c))) kept.push(`${c}: ${text(get(c))}`);
    }
  }
  const times = {
    arrival: text(get('Time of Arraival')),
    bcLeaving: text(get('Time of B/C leaving')),
    iprLeaving: text(get('Time of IPR leaving')),
    detection: text(get('Time of Detection')),
    afterDetection: text(get('Time after detection')),
  };

  // ---- Quantities, cash, productions ----
  const seizedItems = SEIZED.flatMap(({ column, itemType, unit }) => {
    const q = opt(
      column,
      (v) => {
        const n = parseNumber(v);
        return n.ok && n.value >= 0 ? n : { ok: false };
      },
      'bad_number',
    );
    return q
      ? [
          {
            itemType: itemType as CrimeReportInput['seizedItems'][number]['itemType'],
            quantity: q,
            unit,
          },
        ]
      : [];
  });
  const cashNotes = [
    ...CASH_USED.map((c, i) => ({
      kind: 'used' as const,
      denomination: DENOMINATIONS[i]!,
      t: text(get(c)),
    })),
    ...CASH_LEFT.map((c, i) => ({
      kind: 'left' as const,
      denomination: DENOMINATIONS[i]!,
      t: text(get(c)),
    })),
  ]
    .filter((n) => n.t)
    .map((n) => ({ kind: n.kind, denomination: n.denomination, text: n.t!.slice(0, 500) }));
  const productions = ['Production list', 'Production1', 'Production2'].map(
    (c) => text(get(c)) ?? '',
  );
  while (productions.length && !productions[productions.length - 1]) productions.pop();

  // ---- Case ----
  const caseColumns = [
    'Name of Court',
    'Date of Court',
    'court officer',
    'Case no',
    'calling',
    'sithasi',
    'WT',
    'T/R',
    'nochage',
    'reject',
    'deth',
    'result',
    'fine date',
    'rewardgive',
    'type',
    'resitno',
    'resitdate',
    'celldatem',
    'celldated',
    'newcr',
    'crpersan',
    'crhdate',
    'volum no',
    'volum p',
    'index p',
    'index sn',
    ...OUTCOME_FLAGS.map((o) => o.column),
    ...HEARINGS.flatMap((h) => [h.date, h.memo]),
  ];
  const flag = (c: string) => opt(c, parseFlag, 'other') ?? false;
  const hasCase = caseColumns.some((c) => {
    const v = get(c);
    return !isBlank(v) && v !== false && v !== 0;
  });
  const court = ref('court', 'Name of Court');
  const prosecutor = ref('prosecuting_officer', 'court officer');
  let caseDraft:
    ((idOf: (r: RefName) => string, crNotes: string[]) => Omit<CaseInput, 'crimeReportId'>) | null =
    null;
  let fineCents: number | null = null;

  if (hasCase && !court) {
    ex('Name of Court', 'missing_required', '');
    kept.push('case details were not imported because the court is empty');
  } else if (hasCase && court) {
    const types = (
      [
        ['T/R', 'trial'],
        ['WT', 'warrant'],
        ['calling', 'summons'],
      ] as const
    ).filter(([c]) => flag(c));
    if (types.length > 1) ex(types.map(([c]) => c).join(' + '), 'other', 'more than one case type');
    const caseType = types.length === 1 ? types[0]![1] : undefined;

    const convictedDate = opt('fine date', parseDate, 'bad_date');
    const addToConvictRegister = flag('type');
    const outcomes: CaseInput['outcomes'] = [];
    const fine = opt('result', parseMoneyCents, 'bad_number');
    if (fine) {
      fineCents = fine;
      outcomes.push({
        outcomeType: 'fine',
        fineAmount: fine,
        convictedDate,
        receiptNo: text(get('resitno')),
        receiptDate: opt('resitdate', parseDate, 'bad_date'),
        addToConvictRegister,
      });
    }
    const prisonMonths = opt('celldatem', parseWholeNumber, 'bad_number');
    const prisonDays = opt('celldated', parseWholeNumber, 'bad_number');
    for (const { column, outcome } of OUTCOME_FLAGS) {
      if (!flag(column)) continue;
      outcomes.push({
        outcomeType: outcome as OutcomeType,
        convictedDate,
        ...(outcome === 'imprisonment' ? { prisonMonths, prisonDays } : {}),
        addToConvictRegister,
      });
    }
    if ((prisonMonths || prisonDays) && !flag('cell')) {
      ex('celldatem', 'other', 'prison months/days without the imprisonment flag');
      kept.push(`prison: ${prisonMonths ?? 0} months ${prisonDays ?? 0} days (cell not ticked)`);
    }
    if (addToConvictRegister && !outcomes.length)
      ex('type', 'other', 'add to convicts register without an outcome');
    const caseNumber = text(get('Case no'));
    if (outcomes.length && !caseNumber)
      ex('Case no', 'other', 'outcome recorded without a case number');

    const hearings: CaseInput['hearings'] = [];
    for (const h of HEARINGS) {
      const date = opt(h.date, parseDate, 'bad_date');
      const memo = text(get(h.memo));
      if (date) hearings.push({ kind: h.kind, date, ...(memo ? { memo } : {}) });
      else if (memo) kept.push(`${h.memo}: ${memo}`);
    }
    const register = {
      volumeNo: text(get('volum no')),
      volumePage: text(get('volum p')),
      indexPage: text(get('index p')),
      indexSn: text(get('index sn')),
    };
    const handover = {
      officer: text(get('newcr')),
      location: text(get('crpersan')),
      date: opt('crhdate', parseDate, 'bad_date'),
    };
    const courtDate = opt('Date of Court', parseDate, 'bad_date');
    const flags = {
      sithasi: flag('sithasi'),
      permissionPending: flag('nochage'),
      withdrawn: flag('reject'),
      accusedDied: flag('deth'),
      rewardVoucherReceived: flag('rewardgive'),
    };
    caseDraft = (idOf) => ({
      courtId: idOf(court),
      courtDate,
      prosecutingOfficerId: prosecutor ? idOf(prosecutor) : undefined,
      caseNumber,
      caseType,
      ...flags,
      hearings,
      outcomes,
      register: Object.values(register).some(Boolean) ? register : undefined,
      handover: Object.values(handover).some(Boolean) ? handover : undefined,
    });
  }

  // ---- Notes ----
  const incident = text(get('incedent'));
  const quantity = opt('Quantity', parseWholeNumber, 'bad_number');
  const crFields = {
    crYear: number.crYear,
    crNumber: number.crNumber,
    month,
    halfYear,
    detectionDate,
    place: text(get('Place of Detection')),
    quantity,
    quantityExtra: opt('Quantity1', parseWholeNumber, 'bad_number'),
    overQuantity: opt('Over Quantity', parseWholeNumber, 'bad_number'),
    cashFoundPlace: text(get('place of cash'))?.slice(0, 500),
    cashSerials: text(get('Cash Number')),
    cashSerials1: text(get('Cash Number 1')),
    informantHelp: text(get('infor help')),
    informantNote2: text(get('infor 2')),
    accusedNote: text(get('Accused note')),
    accused,
    surety,
    times: Object.values(times).some(Boolean) ? times : undefined,
    seizedItems,
    cashNotes,
    productions,
  };
  const bottle = text(get('Bottle type'));
  if (bottle) kept.push(`Bottle type: ${bottle}`);

  const refs = [
    office,
    offence,
    ...Object.values(officers),
    court,
    prosecutor,
    ...support.map((s) => s.r),
  ].filter((r): r is RefName => !!r);

  return {
    label,
    crNumber: number.crNumber,
    crYear: number.crYear,
    refs,
    offenceCode,
    quantity: quantity ?? null,
    fineCents,
    build(idOf) {
      const issues: ImportException[] = [];
      const notes = [
        incident,
        ...(kept.length ? ['[import] values that could not be read:', ...kept] : []),
      ]
        .filter(Boolean)
        .join('\n');
      const ids = Object.fromEntries(
        Object.entries(officers).map(([k, r]) => [k, r ? idOf(r) : undefined]),
      );
      const crParsed = CrimeReportInput.safeParse(
        stripUndefined({
          ...crFields,
          ...ids,
          officeId: idOf(office),
          offenceTypeId: idOf(offence),
          supportOfficers: support.map((s) => ({ officerId: idOf(s.r), position: s.position })),
          notes: notes || undefined,
        }),
      );
      if (!crParsed.success) {
        for (const i of crParsed.error.issues) {
          issues.push({ row: label, column: i.path.join('.'), value: i.message, reason: 'other' });
        }
        return { cr: null, case: null, issues };
      }
      let caseInput: Omit<CaseInput, 'crimeReportId'> | null = null;
      if (caseDraft) {
        const draft = stripUndefined(caseDraft(idOf, kept));
        const parsed = CaseInput.omit({ crimeReportId: true }).safeParse(draft);
        if (parsed.success) caseInput = parsed.data;
        else {
          for (const i of parsed.error.issues) {
            issues.push({
              row: label,
              column: `case.${i.path.join('.')}`,
              value: i.message,
              reason: 'other',
            });
          }
        }
      }
      return { cr: crParsed.data, case: caseInput, issues };
    },
  };
}

/** Zod's `.optional()` accepts undefined, but nested `{ x: undefined }` objects are noise in the audit log. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T;
  }
  return value;
}
