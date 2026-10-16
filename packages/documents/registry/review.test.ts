import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TemplateEntry } from './registry.ts';
import { applyReview, parseCsv, REVIEW_COLUMNS, reviewSheetCsv } from './review.ts';

const entry = (id: string, offenceCodes: string[] = [], notes?: string): TemplateEntry => ({
  id,
  title: id.slice(id.indexOf('/') + 1).replace(/\.docx$/, ''),
  family: 'plaint',
  offenceCodes,
  variant: {},
  status: 'unconfirmed',
  ...(notes ? { notes } : {}),
});

const ENTRIES = [
  entry('PUDS/puds  බෝතලය.docx', ['PUDS']),
  entry('PUDS/puds කෑනය.docx', ['PUDS']),
  entry('GOLD LEAF/beedi.docx', [], 'offence code to confirm'),
];

const sheet = (entries: TemplateEntry[]) =>
  reviewSheetCsv(entries.map((e) => ({ entry: e, variant: 'bottle, "750 ml"', emptyFields: ['dh5'], samplePdf: `templates/${e.id}` })));

/** A sheet as staff return it: answers typed into the last three columns. */
function answered(answers: Record<string, [string, string, string]>, sep = ','): string {
  const rows = parseCsv(sheet(ENTRIES)).map((r) => {
    const a = answers[r['Template id']!];
    if (a) [r['Decision: current / old copy'], r['Correct offence codes'], r['Comments']] = a;
    return r;
  });
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [REVIEW_COLUMNS.map(q).join(sep), ...rows.map((r) => REVIEW_COLUMNS.map((c) => q(r[c] ?? '')).join(sep))].join('\n');
}

test('the review sheet round-trips through the CSV parser, Sinhala and quotes intact', () => {
  const csv = sheet(ENTRIES);
  assert.ok(csv.startsWith('﻿'), 'BOM so Excel reads UTF-8');
  const rows = parseCsv(csv);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]!['Template id'], 'PUDS/puds  බෝතලය.docx');
  assert.equal(rows[0]!['Variant'], 'bottle, "750 ml"');
  assert.equal(rows[2]!['Questions'], 'offence code to confirm');
});

test('parseCsv reads semicolon-separated sheets (Excel in some locales)', () => {
  const rows = parseCsv(answered({}, ';'));
  assert.equal(rows.length, 3);
  assert.equal(rows[1]!['File name'], 'puds කෑනය');
});

test('decisions, offence codes and comments are applied', () => {
  const result = applyReview(
    ENTRIES,
    parseCsv(
      answered({
        'PUDS/puds  බෝතලය.docx': ['current', '', ''],
        'PUDS/puds කෑනය.docx': ['Old copy', '', 'replaced in 2023'],
        'GOLD LEAF/beedi.docx': ['', 'pumb, pdfc', ''],
      }),
    ),
  );
  assert.deepEqual(result.errors, []);
  const [bottle, can, beedi] = result.entries;
  assert.equal(bottle!.status, 'current');
  assert.equal(can!.status, 'archived');
  assert.equal(can!.notes, 'staff: replaced in 2023');
  assert.deepEqual(beedi!.offenceCodes, ['PUMB', 'PDFC']);
  assert.equal(beedi!.status, 'unconfirmed');
  assert.equal(result.changed.length, 3);
  assert.equal(ENTRIES[0]!.status, 'unconfirmed', 'input entries are not modified');
});

test('an empty sheet changes nothing', () => {
  const result = applyReview(ENTRIES, parseCsv(answered({})));
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.entries, ENTRIES);
});

test('any bad row stops the whole sheet', () => {
  const result = applyReview(
    ENTRIES,
    parseCsv(
      answered({
        'PUDS/puds  බෝතලය.docx': ['current', '', ''],
        'PUDS/puds කෑනය.docx': ['maybe', '', ''],
        'GOLD LEAF/beedi.docx': ['', 'P1', ''],
      }),
    ),
  );
  assert.equal(result.errors.length, 2);
  assert.deepEqual(result.changed, []);
  assert.equal(result.entries[0]!.status, 'unconfirmed');
});

test('unknown template ids and sheets without the id column are rejected', () => {
  const rows = parseCsv(answered({}));
  rows[0]!['Template id'] = 'PUDS/missing.docx';
  assert.match(applyReview(ENTRIES, rows).errors[0]!, /unknown template id/);
  assert.match(applyReview(ENTRIES, [{ Foo: 'x' }]).errors[0]!, /no "Template id" column/);
});
