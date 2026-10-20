// Files staff review after a dry run: the exceptions list as CSV (opens in Excel with Sinhala
// intact), and the totals comparison with the old Access reports (A14).
import type { ImportReport, ImportTotals } from '@excise/contract';

const BOM = String.fromCharCode(0xfeff);

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One line per problem: exceptions, unknown names, and columns whose data is not imported. */
export function reportCsv(report: ImportReport): string {
  const lines: (string | number)[][] = [
    ['Section', 'Row (CR number)', 'Column', 'Value', 'Reason'],
  ];
  for (const e of report.exceptions) lines.push(['exception', e.row, e.column, e.value, e.reason]);
  for (const u of report.unverifiedRefs)
    lines.push(['unknown name', '', u.kind, u.value, 'not in the lookup lists']);
  for (const c of report.columns.unmapped)
    lines.push(['unmapped column', '', c, '', 'NOT imported: add it to columns.ts']);
  for (const [c, n] of Object.entries(report.columns.notStored)) {
    lines.push(['not stored', '', c, `${n} rows have a value`, 'no field in the new system yet']);
  }
  return BOM + lines.map((l) => l.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/**
 * The numbers staff read from the old Access reports. Money in rupees, as the reports print it.
 * Leave out what you do not have; only what is given is compared.
 */
export interface ExpectedTotals {
  crs?: number;
  crsByYear?: Record<string, number>;
  finesByYearRupees?: Record<string, number>;
  quantityByOffence?: Record<string, number>;
}

export interface TotalsDifference {
  what: string;
  expected: number;
  imported: number;
}

export function compareTotals(expected: ExpectedTotals, actual: ImportTotals): TotalsDifference[] {
  const out: TotalsDifference[] = [];
  const check = (what: string, e: number, a: number) => {
    if (Math.abs(e - a) > 1e-9) out.push({ what, expected: e, imported: a });
  };
  if (expected.crs !== undefined) check('CRs', expected.crs, actual.crs);
  for (const [y, n] of Object.entries(expected.crsByYear ?? {}))
    check(`CRs ${y}`, n, actual.crsByYear[y] ?? 0);
  for (const [y, rs] of Object.entries(expected.finesByYearRupees ?? {})) {
    check(`fines ${y} (Rs)`, rs, (actual.finesByYear[y] ?? 0) / 100);
  }
  for (const [o, q] of Object.entries(expected.quantityByOffence ?? {})) {
    check(`Quantity ${o}`, q, actual.quantityByOffence[o.toUpperCase()] ?? 0);
  }
  return out;
}
