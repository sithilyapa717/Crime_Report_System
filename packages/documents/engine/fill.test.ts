import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { formatDate, formatMoney, formatTime } from '../mapping/format.ts';
import { lookupField } from '../mapping/fields.ts';
import { SAMPLE_CR } from '../mapping/sample-data.ts';
import { fillTemplate } from './fill.ts';
import { DocxZip } from './zip.ts';

const ORIGINALS = join(import.meta.dirname, '..', 'templates', 'original');
const template = readFileSync(join(ORIGINALS, 'PUDS', 'puds  බෝතලය.docx'));

test('zip round trip without edits keeps every entry byte-identical', () => {
  const a = DocxZip.read(template);
  const b = DocxZip.read(a.write());
  assert.deepEqual(b.names(), a.names());
  a.entries.forEach((e, i) => assert.ok(b.entries[i].compressed.equals(e.compressed), e.name));
});

test('fillTemplate fills a real template and removes the Access link', () => {
  const { docx, report } = fillTemplate(template, SAMPLE_CR);
  const zip = DocxZip.read(docx);
  const doc = zip.getText('word/document.xml') ?? '';
  assert.doesNotMatch(doc, /MERGEFIELD/);
  assert.ok(doc.includes('කේ. ඒ. සමන් කුමාර'));
  assert.ok(doc.includes('2026.01.15'));
  assert.equal(report.mailMergeLinkRemoved, true);
  assert.deepEqual(report.unknown, []);
  assert.doesNotMatch(zip.getText('word/settings.xml') ?? '', /mailMerge/);
  assert.doesNotMatch(zip.getText('word/_rels/settings.xml.rels') ?? '', /mailMergeSource/);
});

test('fillTemplate does not change the template buffer', () => {
  const copy = Buffer.from(template);
  fillTemplate(copy, SAMPLE_CR);
  assert.ok(copy.equals(template));
});

test('missing values are reported, or rejected with onMissing=error', () => {
  const { report } = fillTemplate(template, {});
  assert.ok(report.missing.includes('Name_of_Accused'));
  assert.throws(() => fillTemplate(template, {}, { onMissing: 'error' }), /no value for/);
});

test('field lookup ignores case and knows the aliases', () => {
  assert.equal(lookupField('name_of_Suerty')?.name, 'Name_of_Suerty');
  assert.equal(lookupField('Date_of_court')?.name, 'Date_of_Court');
  assert.equal(lookupField('Accused_Name')?.name, 'Name_of_Accused');
  assert.equal(lookupField('ග්රහණ_නිළධාරි')?.name, 'detection_officer');
  assert.equal(lookupField('nope'), undefined);
});

test('old formats', () => {
  assert.equal(formatDate('2026-1-5'), '2026.01.05');
  assert.equal(formatDate(new Date(2026, 0, 15)), '2026.01.15');
  assert.equal(formatTime('9:05'), '09.05');
  assert.equal(formatMoney(2500000), '25000');
  assert.equal(formatMoney(2500050), '25000.50');
  assert.throws(() => formatMoney(1.5));
});
