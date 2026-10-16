// Staff review of the templates (D1 / §10 Q3): a review sheet staff fill in Excel, and applying
// their answers back to templates.json. Pure functions; the scripts do the file work.
import type { TemplateEntry } from './registry.ts';

export const REVIEW_COLUMNS = [
  'No',
  'Template id',
  'Folder',
  'File name',
  'Family',
  'Offence codes (proposed)',
  'Variant',
  'Questions',
  'Fields left empty in sample',
  'Sample PDF',
  'Decision: current / old copy',
  'Correct offence codes',
  'Comments',
] as const;

const DECISION = 'Decision: current / old copy';
const CODES = 'Correct offence codes';
const COMMENTS = 'Comments';
const ID = 'Template id';

export interface ReviewRowInput {
  entry: TemplateEntry;
  variant: string;
  emptyFields: string[];
  samplePdf: string;
}

// ---------------------------------------------------------------- CSV (RFC 4180, Excel-friendly)

function csvCell(value: string): string {
  return /[",\r\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** UTF-8 with BOM and CRLF line ends, which Excel opens with Sinhala intact. */
export function reviewSheetCsv(rows: ReviewRowInput[]): string {
  const lines = [REVIEW_COLUMNS.map(csvCell).join(',')];
  rows.forEach(({ entry, variant, emptyFields, samplePdf }, i) => {
    const folder = entry.id.includes('/') ? entry.id.slice(0, entry.id.indexOf('/')) : '';
    const cells = [
      String(i + 1),
      entry.id,
      folder,
      entry.title,
      entry.family,
      entry.offenceCodes.join(' '),
      variant,
      entry.notes ?? '',
      emptyFields.join(' '),
      samplePdf,
      entry.status === 'current' ? 'current' : entry.status === 'archived' ? 'old copy' : '',
      '',
      '',
    ];
    lines.push(cells.map(csvCell).join(','));
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Parses CSV saved by Excel: comma, semicolon or tab separated, quoted cells, optional BOM. */
export function parseCsv(text: string): Record<string, string>[] {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const sep = [',', ';', '\t'].map((s) => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    records.push(row);
  }
  const [header, ...body] = records.filter((r) => r.some((c) => c.trim() !== ''));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// ---------------------------------------------------------------- applying the answers

export interface ReviewChange {
  id: string;
  title: string;
  changes: string[];
}

export interface ReviewResult {
  entries: TemplateEntry[];
  changed: ReviewChange[];
  errors: string[];
}

function decisionStatus(value: string): TemplateEntry['status'] | null | 'invalid' {
  const v = value.trim().toLowerCase();
  if (v === '') return null;
  if (['current', 'yes', 'y', 'use'].includes(v)) return 'current';
  if (['old copy', 'old', 'copy', 'archived', 'archive', 'no', 'n', 'not used'].includes(v)) return 'archived';
  return 'invalid';
}

/**
 * Applies a filled review sheet to the registry entries. Rows with no decision, codes or comment
 * change nothing. Nothing is applied if any row has an error (unknown id, bad decision or code).
 */
export function applyReview(entries: TemplateEntry[], rows: Record<string, string>[]): ReviewResult {
  const byId = new Map(entries.map((e) => [e.id, { ...e, offenceCodes: [...e.offenceCodes] }]));
  const changed: ReviewChange[] = [];
  const errors: string[] = [];

  if (rows.length && !(ID in rows[0]!)) {
    return { entries, changed: [], errors: [`the sheet has no "${ID}" column (was it saved as CSV UTF-8?)`] };
  }

  rows.forEach((row, i) => {
    const line = `row ${i + 2}`;
    const id = row[ID] ?? '';
    const entry = byId.get(id);
    if (!entry) {
      errors.push(`${line}: unknown template id "${id}"`);
      return;
    }
    const notes: string[] = [];

    const status = decisionStatus(row[DECISION] ?? '');
    if (status === 'invalid') errors.push(`${line} (${entry.title}): decision "${row[DECISION]}" is not "current" or "old copy"`);
    else if (status && status !== entry.status) {
      notes.push(`status ${entry.status} → ${status}`);
      entry.status = status;
    }

    const codesText = (row[CODES] ?? '').trim();
    if (codesText) {
      const codes = codesText.toUpperCase().split(/[\s,;+/]+/).filter(Boolean);
      const bad = codes.filter((c) => !/^[A-Z]{2,6}$/.test(c));
      if (bad.length) errors.push(`${line} (${entry.title}): offence code(s) ${bad.join(', ')} look wrong`);
      else if (codes.join(' ') !== entry.offenceCodes.join(' ')) {
        notes.push(`offences ${entry.offenceCodes.join(' ') || '(none)'} → ${codes.join(' ')}`);
        entry.offenceCodes = codes;
      }
    }

    const comment = (row[COMMENTS] ?? '').trim();
    if (comment && !(entry.notes ?? '').includes(`staff: ${comment}`)) {
      entry.notes = [entry.notes, `staff: ${comment}`].filter(Boolean).join('; ');
      notes.push('comment added');
    }

    if (notes.length) changed.push({ id, title: entry.title, changes: notes });
  });

  if (errors.length) return { entries, changed: [], errors };
  return { entries: entries.map((e) => byId.get(e.id)!), changed, errors };
}
