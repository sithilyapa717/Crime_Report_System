// Every column of the legacy `Office` table and where it goes (REWRITE_PLAN §11, names from §1.4,
// §1.5 and the merge fields). The importer compares this list with the real file: columns in the
// file but not here are reported as "unmapped", columns here but not in the file as "missing", so
// nothing is dropped silently. Correct a name here when the real file spells it differently.
//
// Column names are matched case- and space-insensitively (`normalizeColumn`).

export const normalizeColumn = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();

const range = (prefix: string, from: number, to: number, suffix = '') =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}${suffix}`);

/** Notes left over: `Cash1 5000` … `Cash7 10` (notes used are `Cash 5000` … `Cash 10`). */
export const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10] as const;
export const CASH_USED = DENOMINATIONS.map((d) => `Cash ${d}`);
export const CASH_LEFT = DENOMINATIONS.map((d, i) => `Cash${i + 1} ${d}`);

/** sp1-sp15 → item type and unit (§1.4 table). */
export const SEIZED: { column: string; itemType: string; unit: string }[] = [
  { column: 'sp1', itemType: 'spirit', unit: 'L' },
  { column: 'sp2', itemType: 'kasippu', unit: 'L' },
  { column: 'sp3', itemType: 'goda', unit: 'L' },
  { column: 'sp4', itemType: 'state_arrack', unit: 'L' },
  { column: 'sp5', itemType: 'beer', unit: 'L' },
  { column: 'sp6', itemType: 'foreign_liquor', unit: 'L' },
  { column: 'sp7', itemType: 'cigarettes', unit: 'pcs' },
  { column: 'sp8', itemType: 'beedi', unit: 'pcs' },
  { column: 'sp9', itemType: 'cannabis', unit: 'g' },
  { column: 'sp10', itemType: 'cannabis_plants', unit: 'pcs' },
  { column: 'sp11', itemType: 'heroin', unit: 'mg' },
  { column: 'sp12', itemType: 'tablets', unit: 'pcs' },
  { column: 'sp13', itemType: 'cannabis_mixture', unit: 'g' },
  { column: 'sp14', itemType: 'toddy', unit: 'L' },
  { column: 'sp15', itemType: 'ice', unit: 'mg' },
];

/** Outcome flag columns (§1.5) → outcome type. `result` (fine amount) is handled separately. */
export const OUTCOME_FLAGS: { column: string; outcome: string }[] = [
  { column: 'praja', outcome: 'community_service' },
  { column: 'cell', outcome: 'imprisonment' },
  { column: 'cellbrake', outcome: 'suspended_sentence' },
  { column: 'wrelese', outcome: 'admonished' },
  { column: 'samatha', outcome: 'settlement' },
  { column: 'pariwasa', outcome: 'probation' },
  { column: 'punuru', outcome: 'rehabilitation' },
  { column: 'rajaya', outcome: 'government_fee' },
  { column: 'indepen1', outcome: 'released' },
  { column: 'indepen2', outcome: 'acquitted' },
  { column: 'taking', outcome: 'remanded' },
  { column: 'takecort', outcome: 'handed_to_court' },
  { column: 'cjreport', outcome: 'ag_advice' },
];

/** Hearing date + memo pairs: summons, warrant, then the 21 trial dates (`T/R date`, `T/R date1`…20). */
export const HEARINGS: { date: string; memo: string; kind: 'summons' | 'warrant' | 'trial' }[] = [
  { date: 'calling date', memo: 'calling date m', kind: 'summons' },
  { date: 'W/T date', memo: 'W/T date m', kind: 'warrant' },
  { date: 'T/R date', memo: 'T/R date m', kind: 'trial' },
  ...range('T/R date', 1, 20).map((date, i) => ({
    date,
    memo: `m${i + 1}`,
    kind: 'trial' as const,
  })),
];

export interface ColumnMapping {
  column: string;
  /** Where the value goes; `not stored` columns are reported with their non-empty count. */
  target: string;
}

const m = (target: string, ...columns: string[]): ColumnMapping[] =>
  columns.map((column) => ({ column, target }));

export const OFFICE_COLUMNS: ColumnMapping[] = [
  ...m('crime_reports.cr_number / cr_year', 'CR NO 2017', 'YearCR'),
  ...m('derived from the CR number (not stored)', 'snocr'),
  ...m('crime_reports', 'office', 'month', 'fistsecon'),
  ...m(
    'crime_reports',
    'Date of Detection',
    'Place of Detection',
    'Offence',
    'polise unit',
    'prale name',
  ),
  ...m('crime_reports (officers)', 'detection officer', 'Informan', 'Ac', 'Sc', 'oic', 'Drive'),
  ...m('cr_support_officers', ...range('dh', 1, 5), ...range('inh', 1, 5)),
  ...m(
    'accused',
    'Name of Accused',
    'Address of Accused',
    'NIC No of Accused',
    'Age',
    'Hight',
    'male female',
    'Accused details',
    'driveno',
    'forinno',
    'deno',
  ),
  ...m('crime_reports (notes)', 'Accused note', 'infor help', 'infor 2', 'incedent'),
  ...m('sureties', 'Name of Suerty', 'Address of Suerty', 'NIC Suerty', 'beno'),
  ...m(
    'detection_times',
    'Time of Arraival',
    'Time of B/C leaving',
    'Time of IPR leaving',
    'Time of Detection',
    'Time after detection',
  ),
  ...m('cash_notes', ...CASH_USED, ...CASH_LEFT),
  ...m('crime_reports (cash)', 'Cash Number', 'Cash Number 1', 'place of cash'),
  ...m('seized_items', ...SEIZED.map((s) => s.column)),
  ...m('crime_reports (quantities)', 'Quantity', 'Quantity1', 'Over Quantity'),
  ...m('not stored: no field yet (Bottle type)', 'Bottle type'),
  ...m('productions', 'Production list', 'Production1', 'Production2'),
  ...m('cases', 'Name of Court', 'Date of Court', 'court officer', 'Case no'),
  ...m('cases (type and flags)', 'calling', 'sithasi', 'WT', 'T/R', 'nochage', 'reject', 'deth'),
  ...m('hearings', ...HEARINGS.flatMap((h) => [h.date, h.memo])),
  ...m('outcomes', 'result', 'fine date', ...OUTCOME_FLAGS.map((o) => o.column)),
  ...m('outcomes (imprisonment)', 'celldatem', 'celldated'),
  ...m('outcomes (receipt)', 'resitno', 'resitdate'),
  ...m('outcomes (add to convicts register)', 'type'),
  ...m(
    'not stored: no field yet (case year/month for the fines report)',
    'casenyear',
    'casenmonth',
  ),
  ...m('reward_vouchers', 'rewardgive'),
  ...m('cr_handover', 'newcr', 'crpersan', 'crhdate'),
  ...m('cases.register', 'volum no', 'volum p', 'index p', 'index sn'),
  ...m('file store', 'picture'),
  ...m('Access row key (not stored)', 'ID'),
];

/** The 14 lookup tables (§1.3) → reference list. */
export const LOOKUP_TABLES: { table: string; kind: string }[] = [
  { table: 'Table office', kind: 'office' },
  { table: 'Table year', kind: 'year' },
  { table: 'Table detection', kind: 'detecting_officer' },
  { table: 'Table information', kind: 'informant' },
  { table: 'Table court', kind: 'court' },
  { table: 'Table court officer', kind: 'prosecuting_officer' },
  { table: 'Table offence', kind: 'offence' },
  { table: 'Table prala name', kind: 'divisional_secretariat' },
  { table: 'Table staff', kind: 'support_officer' },
  { table: 'Table Ac', kind: 'ac' },
  { table: 'Table Sc', kind: 'sc' },
  { table: 'Table OIC', kind: 'oic' },
  { table: 'Table Drive', kind: 'driver' },
  { table: 'Table polise', kind: 'police_area' },
];

/** Tables that are read but never imported (passwords are not migrated). */
export const SKIPPED_TABLES = ['login', 'login1', 'login2', 'login3'];
