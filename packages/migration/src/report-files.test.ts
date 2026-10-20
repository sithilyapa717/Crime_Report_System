import type { ImportReport } from '@excise/contract';
import { describe, expect, it } from 'vitest';
import { compareTotals, reportCsv } from './report-files.js';

const report: ImportReport = {
  mode: 'dry_run',
  startedAt: '',
  finishedAt: '',
  rowsRead: 3,
  imported: 2,
  skipped: 1,
  unverifiedRefs: [{ kind: 'court', value: 'මීගමුව, "පැරණි"' }],
  exceptions: [
    { row: '3/2026', column: 'Date of Detection', value: '02.03.2026', reason: 'bad_date' },
  ],
  totals: {
    crs: 2,
    crsByYear: { '2025': 1, '2026': 1 },
    finesByYear: { '2026': 150050 },
    quantityByOffence: { PUDS: 3500 },
  },
  columns: { unmapped: ['Mystery'], missing: [], notStored: { 'Bottle type': 4 } },
  lookupRows: {},
  picturesCopied: 0,
};

describe('import report files', () => {
  it('CSV lists every problem with a BOM and quoting', () => {
    const csv = reportCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines).toEqual([
      'Section,Row (CR number),Column,Value,Reason',
      'exception,3/2026,Date of Detection,02.03.2026,bad_date',
      'unknown name,,court,"මීගමුව, ""පැරණි""",not in the lookup lists',
      'unmapped column,,Mystery,,NOT imported: add it to columns.ts',
      'not stored,,Bottle type,4 rows have a value,no field in the new system yet',
    ]);
  });

  it('compares only the totals staff gave, fines in rupees', () => {
    expect(
      compareTotals(
        {
          crs: 2,
          crsByYear: { '2026': 2 },
          finesByYearRupees: { '2026': 1500.5 },
          quantityByOffence: { puds: 3000 },
        },
        report.totals,
      ),
    ).toEqual([
      { what: 'CRs 2026', expected: 2, imported: 1 },
      { what: 'Quantity puds', expected: 3000, imported: 3500 },
    ]);
    expect(compareTotals({}, report.totals)).toEqual([]);
  });
});
