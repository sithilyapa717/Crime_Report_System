import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConvictRow, ReportResult } from '../../shared/contract/src/index.ts';
import { renderCertificateE48 } from './certificate-e48.ts';
import { renderConvictsList } from './convicts-list.ts';
import { renderRegister } from './register.ts';

const row = (extra: Partial<ConvictRow> = {}): ConvictRow => ({
  crimeReportId: 'c',
  crNumber: '1/2026',
  officeId: 'o',
  accusedName: 'A',
  accusedAddress: null,
  accusedNic: null,
  offenceCode: 'UPH',
  offenceName: '',
  quantity: null,
  courtId: null,
  courtName: null,
  caseNumber: null,
  convictedDate: null,
  outcomes: [],
  fineAmount: null,
  prisonMonths: null,
  prisonDays: null,
  ...extra,
});

test('ඊ 48 with missing data: empty lines, offence code when there is no name, no ticks', () => {
  const html = renderCertificateE48([row()]).html;
  assert.match(html, /<dd>UPH<\/dd>/, 'falls back to the offence code');
  assert.equal(html.match(/☑/g), null);
  assert.equal(html.match(/☐/g)?.length, 5);
  assert.doesNotMatch(html, /null|undefined|NaN/);
});

test('convicts list with missing data prints empty cells, never "null"', () => {
  const html = renderConvictsList([row()], { year: 2026, month: 1 }).html;
  assert.doesNotMatch(html.slice(html.indexOf('<tbody>')), /null|undefined|NaN/);
});

test('convicts list escapes values', () => {
  const html = renderConvictsList([row({ accusedName: '<b>x</b>', offenceCode: 'a & b' })], { year: 2026 }).html;
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(html.includes('a &amp; b'));
});

test('register: a malformed stored date prints as stored instead of stopping the printout', () => {
  const result: ReportResult = {
    columns: [{ key: 'detectionDate', labelKey: 'd' }, { key: 'fineAmount', labelKey: 'f' }],
    rows: [
      { detectionDate: '2026-02-30', fineAmount: 100 },
      { detectionDate: '2026-02-03', fineAmount: null },
    ],
    fineTotal: 100,
  };
  const html = renderRegister(result, { title: 'T', caption: (k) => k }).html;
  assert.ok(html.includes('2026-02-30'), 'impossible date shown as stored');
  assert.ok(html.includes('2026.02.03'));
  assert.ok(html.includes('<td class="num">1</td>'), 'Rs 1.00 as 1');
});

test('register: empty result prints one dash row and no total', () => {
  const html = renderRegister(
    { columns: [{ key: 'crNumber', labelKey: 'c' }, { key: 'fineAmount', labelKey: 'f' }], rows: [], fineTotal: 0 },
    { title: '<T>', caption: (k) => k },
  ).html;
  assert.match(html, /colspan="2">–</);
  assert.doesNotMatch(html, /<tfoot>/);
  assert.ok(html.includes('<title>&lt;T&gt;</title>'));
});
