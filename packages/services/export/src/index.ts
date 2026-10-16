import { writeFile } from 'node:fs/promises';
import type { ReportResult } from '@excise/contract';
import ExcelJS from 'exceljs';

/** Turns a column's `labelKey` into its Sinhala caption (from packages/shared/labels). */
export type LabelResolver = (labelKey: string) => string;

/** Money columns hold cents; files show rupees. */
const MONEY_KEYS = new Set(['fineAmount']);

function cellValue(key: string, v: string | number | null): string | number | null {
  if (v === null) return null;
  return MONEY_KEYS.has(key) && typeof v === 'number' ? v / 100 : v;
}

function csvField(v: string | number | null): string {
  if (v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a UTF-8 BOM so Excel opens Sinhala text correctly. */
export function toCsv(result: ReportResult, label: LabelResolver): string {
  const lines = [result.columns.map((c) => csvField(label(c.labelKey))).join(',')];
  for (const row of result.rows) {
    lines.push(result.columns.map((c) => csvField(cellValue(c.key, row[c.key] ?? null))).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export async function writeCsv(result: ReportResult, label: LabelResolver, filePath: string): Promise<void> {
  await writeFile(filePath, toCsv(result, label), 'utf8');
}

export async function toXlsxBuffer(result: ReportResult, label: LabelResolver): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  ws.columns = result.columns.map((c) => ({
    header: label(c.labelKey),
    key: c.key,
    width: 18,
    style: MONEY_KEYS.has(c.key) ? { numFmt: '#,##0.00' } : {},
  }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of result.rows) {
    ws.addRow(Object.fromEntries(result.columns.map((c) => [c.key, cellValue(c.key, row[c.key] ?? null)])));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function writeXlsx(result: ReportResult, label: LabelResolver, filePath: string): Promise<void> {
  await writeFile(filePath, await toXlsxBuffer(result, label));
}
