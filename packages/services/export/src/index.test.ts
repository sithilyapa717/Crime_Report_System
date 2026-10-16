import type { ReportResult } from '@excise/contract';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { toCsv, toXlsxBuffer } from './index.js';

const result: ReportResult = {
  columns: [
    { key: 'accusedName', labelKey: 'report.col.accusedName' },
    { key: 'fineAmount', labelKey: 'report.col.fineAmount' },
  ],
  rows: [
    { accusedName: 'කමල්, "පෙරේරා"', fineAmount: 150050 },
    { accusedName: 'Nimal', fineAmount: null },
  ],
  fineTotal: 150050,
};
const label = (k: string) => (k === 'report.col.fineAmount' ? 'දඩ මුදල' : 'නම');

describe('export', () => {
  it('writes CSV with BOM, Sinhala headers, quoting and rupees', () => {
    const csv = toCsv(result, label);
    expect(csv.startsWith(String.fromCharCode(0xfeff) + 'නම,දඩ මුදල\r\n')).toBe(true);
    expect(csv).toContain('"කමල්, ""පෙරේරා""",1500.5\r\n');
    expect(csv).toContain('Nimal,\r\n');
  });

  it('writes an xlsx that reads back', async () => {
    const wb = new ExcelJS.Workbook();
    // exceljs types predate Node's generic Buffer.
    await wb.xlsx.load((await toXlsxBuffer(result, label)) as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Report')!;
    expect(ws.getRow(1).getCell(2).value).toBe('දඩ මුදල');
    expect(ws.getRow(2).getCell(2).value).toBe(1500.5);
    expect(ws.rowCount).toBe(3);
  });
});
