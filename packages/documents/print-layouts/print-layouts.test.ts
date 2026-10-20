import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ConvictRow, ReportResult } from '../../shared/contract/src/index.ts';
import { renderCertificateE48 } from './certificate-e48.ts';
import { convictsListTitle, renderConvictsList } from './convicts-list.ts';
import { renderRegister } from './register.ts';
import { CONVICTS_LIST, E48 } from './wording.ts';

const row = (extra: Partial<ConvictRow> = {}): ConvictRow => ({
  crimeReportId: 'cr-1',
  crNumber: '12/2026',
  officeId: 'o',
  accusedName: 'කේ. ඒ. සමන් කුමාර',
  accusedAddress: 'අංක 15, පල්ලිය පාර',
  accusedNic: '851234567V',
  offenceCode: 'PUDS',
  offenceName: 'ස්ප්‍රිතු සතුව තබා ගැනීම',
  quantity: 750,
  courtId: 'c',
  courtName: 'මීගමුව මහේස්ත්‍රාත් අධිකරණය',
  caseNumber: '45678/26',
  convictedDate: '2026-03-10',
  outcomes: ['fine', 'community_service'],
  fineAmount: 2500000,
  prisonMonths: null,
  prisonDays: null,
  ...extra,
});

/** Visible text of the HTML body, without tags (enough to check wording and values). */
const text = (html: string) =>
  html
    .slice(html.indexOf('<body>'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

// The legacy inventory lives next to the repository on the developers' PCs, not in CI.
const INVENTORY = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'LEGACY_SCREEN_INVENTORY.md');

test('every fixed caption appears word for word in the old Access screens', { skip: !existsSync(INVENTORY) }, () => {
  const legacy = readFileSync(INVENTORY, 'utf8');
  for (const [key, value] of [...Object.entries(E48), ...Object.entries(CONVICTS_LIST)]) {
    assert.ok(legacy.includes(value), `${key}: "${value}" is not in LEGACY_SCREEN_INVENTORY.md`);
  }
});

test('ඊ 48: all wording, values in old formats, sentence ticks', () => {
  const html = renderCertificateE48([row()]).html;
  const t = text(html);
  for (const value of Object.values(E48)) assert.ok(t.includes(value), value);
  assert.ok(t.includes('කේ. ඒ. සමන් කුමාර'));
  assert.ok(t.includes('2026.03.10'));
  assert.ok(t.includes(`${E48.fine} 25000`));
  assert.ok(t.includes(`☑ ${E48.communityService}`));
  assert.ok(t.includes(`☐ ${E48.imprisonment}`));
});

test('ඊ 48: one certificate per row, page break between, and nothing to print is an error', () => {
  const layout = renderCertificateE48([row(), row({ accusedName: 'B' })]);
  assert.equal(layout.html.match(/<section class="cert">/g)?.length, 2);
  assert.equal(layout.landscape, false);
  assert.match(layout.footerTemplate, /pageNumber/);
  assert.throws(() => renderCertificateE48([]), /no conviction/);
});

test('values are HTML-escaped', () => {
  const html = renderCertificateE48([row({ accusedName: '<script>x</script> & "q"' })]).html;
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;'));
});

test('convicts list: title from the old report, columns in the old order', () => {
  assert.equal(convictsListTitle({ year: 2026, month: 3 }), '2026 වර්ෂයේ March මාසයේ වැරදිකරුවන්ගේ ලේඛනය');
  assert.equal(convictsListTitle({ year: 2026 }), 'වරදකරුවන්ගේ ලේඛනය – 2026');
  assert.throws(() => convictsListTitle({ year: 2026, month: 13 }));

  const html = renderConvictsList([row(), row({ outcomes: ['imprisonment', 'suspended_sentence'], fineAmount: null })], {
    year: 2026,
    month: 3,
  }).html;
  const heads = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
  const W = CONVICTS_LIST;
  assert.deepEqual(heads, [
    W.crNumber, W.name, W.nic, W.offence, W.quantity, W.fine, W.address, W.court, W.caseNumber, W.convictedDate,
    W.communityService, W.settlement, W.probation, W.rehabilitation, W.governmentFee, W.imprisonment, W.admonished, W.suspended,
  ]);
  const rows = html.split('<tbody>')[1]!.split('</tr>').slice(0, 2);
  // row 1: fine 25000, community service ticked (first sentence column)
  assert.match(rows[0]!, /25000/);
  assert.match(rows[0]!, /<td class="num">750<\/td>/); // `quantity` from ConvictRow
  assert.equal(rows[0]!.match(/☑/g)?.length, 1);
  // row 2: no fine, imprisonment + suspended ticked
  assert.equal(rows[1]!.match(/☑/g)?.length, 2);
  assert.ok(renderConvictsList([], { year: 2026 }).landscape);
});

test('register: captions from the caller, old formats, ticks and the fine total', () => {
  const result: ReportResult = {
    columns: ['crNumber', 'detectionDate', 'fineAmount', 'imprisonment'].map((key) => ({ key, labelKey: `report.col.${key}` })),
    rows: [
      { crNumber: '1/2026', detectionDate: '2026-01-15', fineAmount: 150050, imprisonment: 1 },
      { crNumber: '2/2026', detectionDate: '2026-02-01', fineAmount: null, imprisonment: null },
    ],
    fineTotal: 150050,
  };
  const layout = renderRegister(result, { title: 'T', subtitle: ['S'], caption: (k) => `[${k}]` });
  const t = text(layout.html);
  assert.ok(t.includes('[report.col.crNumber]'));
  assert.ok(t.includes('2026.01.15'));
  assert.ok(t.includes('1500.50'));
  assert.equal(layout.html.match(/☑/g)?.length, 1);
  assert.match(layout.html, /<tfoot><tr>.*1500\.50/s);
  assert.ok(layout.landscape);
});
