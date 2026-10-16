// Field mapping (D4): every merge-field name found in the original templates
// (docs/document-catalogue/MERGE_FIELDS.md) resolves to one canonical field.
//
// Canonical names are the old Access column names with spaces turned into underscores,
// which is what Word used. Matching ignores case, so `name_of_Suerty`, `Date_of_court`,
// `Name_of_court` and `Detection_Officer` need no alias.
// `confirmed: false` marks aliases read from the field name only; agree them with staff and B.
import { formatDate, formatMoney, formatNumber, formatTime } from './format.ts';

export type FieldKind = 'text' | 'date' | 'time' | 'number' | 'money';

/** A raw value from the document-data service (B8). Money is integer cents. */
export type DocumentValue = string | number | Date | null | undefined;

export interface FieldDef {
  name: string;
  kind: FieldKind;
  /** Meaning, in the words of the old screens (REWRITE_PLAN §1.4–§1.5). */
  label: string;
  aliases?: { name: string; confirmed: boolean; note?: string }[];
}

const t = (name: string, label: string, aliases?: FieldDef['aliases']): FieldDef => ({ name, kind: 'text', label, aliases });
const d = (name: string, label: string, aliases?: FieldDef['aliases']): FieldDef => ({ name, kind: 'date', label, aliases });
const tm = (name: string, label: string): FieldDef => ({ name, kind: 'time', label });
const n = (name: string, label: string, aliases?: FieldDef['aliases']): FieldDef => ({ name, kind: 'number', label, aliases });

const FROM_TABLE1 = 'used only by a GOLD LEAF template merged from `Table1`';

export const FIELDS: FieldDef[] = [
  // case and parties
  t('CR_NO_2017', 'CR number n/yyyy', [
    { name: 'CR_NO_2015', confirmed: false, note: 'older column name, UPG' },
    { name: 'CR_No', confirmed: false, note: FROM_TABLE1 },
  ]),
  t('office', 'Excise station / unit'),
  t('Offence', 'Offence code'),
  t('Case_no', 'Court case number'),
  t('Name_of_Court', 'Court'),
  d('Date_of_Court', 'Court date', [{ name: 'Courts_Date', confirmed: false, note: FROM_TABLE1 }]),
  t('court_officer', 'Prosecuting officer'),
  t('Name_of_Accused', 'Accused name', [{ name: 'Accused_Name', confirmed: false, note: FROM_TABLE1 }]),
  t('Address_of_Accused', 'Accused address', [{ name: 'Accused_Address', confirmed: false, note: FROM_TABLE1 }]),
  t('NIC_No_of_Accused', 'Accused NIC'),
  t('Name_of_Suerty', 'Surety name'),
  t('Address_of_Suerty', 'Surety address'),
  t('NIC_Suerty', 'Surety NIC'),

  // detection
  d('Date_of_Detection', 'Detection date', [{ name: 'Detection_Date', confirmed: false, note: FROM_TABLE1 }]),
  t('Place_of_Detection', 'Detection place'),
  t('Informan', 'Informant officer'),
  t('detection_officer', 'Detecting officer', [
    { name: 'ග්රහණ_නිළධාරි', confirmed: false, note: 'Sinhala field name in one UPG template' },
  ]),
  ...[1, 2, 3, 4, 5].map((i) => t(`dh${i}`, `Detection support officer ${i}`)),
  ...[1, 2, 3, 4, 5].map((i) => t(`inh${i}`, `Detection support officer ${i + 5}`)),
  t('Ac', 'Assistant Commissioner (AC)'),
  t('Sc', 'Excise Superintendent (SC)'),
  t('oic', 'Officer in charge (OIC)'),
  t('Drive', 'Driver'),
  t('infor_help', 'Notes (infor help)'),

  // times
  tm('Time_of_Arraival', 'Time of arrival'),
  tm('Time_of_BC_leaving', 'Time decoy buyer (B/C) left'),
  tm('Time_of_IPR_leaving', 'Time team (IPR) left'),
  tm('Time_of_Detection', 'Time of detection'),

  // quantities and productions
  n('Quantity', 'Quantity (total)', [{ name: 'Quantity_Full', confirmed: false, note: FROM_TABLE1 }]),
  n('Quantity1', 'Extra quantity'),
  n('Over_Quantity', 'Quantity left after sampling'),
  n('sp5', 'Beer (L)'),
  t('Production1', 'Production 1'),
  t('Production2', 'Production 2'),

  // cash used in the decoy operation (note counts)
  n('Cash_1000', 'Rs 1000 notes used'),
  n('Cash_500', 'Rs 500 notes used'),
  n('Cash_100', 'Rs 100 notes used'),
  t('Cash_Number', 'Note serial numbers (meaning to confirm)'),
  t('Cash_Number_1', 'Note serial numbers 2 (meaning to confirm)'),
  n('Cash2_1000', 'Rs 1000 notes (Cash2 group)'),
  n('Cash3_500', 'Rs 500 notes (Cash3 group)'),

  // outcome
  { name: 'result', kind: 'money', label: 'Fine amount' },
  d('fine_date', 'Date convicted'),
  d('WT_date', 'Warrant date'),
  t('type', 'Add to convicts register flag'),
];

const BY_NAME = new Map<string, FieldDef>();
for (const f of FIELDS) {
  for (const key of [f.name, ...(f.aliases ?? []).map((a) => a.name)]) {
    const k = key.toLowerCase();
    if (BY_NAME.has(k)) throw new Error(`duplicate field name or alias: ${key}`);
    BY_NAME.set(k, f);
  }
}

/** The canonical field for a template field name, or undefined if it is not mapped. */
export function lookupField(templateName: string): FieldDef | undefined {
  return BY_NAME.get(templateName.toLowerCase());
}

/** Format a raw value the way the old documents showed it. null/undefined → undefined. */
export function formatValue(def: FieldDef, value: DocumentValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  switch (def.kind) {
    case 'text':
      return value instanceof Date ? formatDate(value) : String(value);
    case 'date':
      return typeof value === 'number' ? String(value) : formatDate(value);
    case 'time':
      return typeof value === 'number' ? String(value) : formatTime(value);
    case 'number':
      return typeof value === 'number' ? formatNumber(value) : String(value);
    case 'money':
      if (typeof value !== 'number') throw new Error(`${def.name}: money must be integer cents`);
      return formatMoney(value);
  }
}
