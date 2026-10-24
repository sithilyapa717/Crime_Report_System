import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ConvictRow, ReportResult } from '../../shared/contract/src/index.ts';
import { xmlProblem } from '../../../tests/documents-fidelity/fidelity-lib.ts';
import { DocxZip } from '../engine/zip.ts';
import { visibleText } from '../engine/xml.ts';
import { renderCertificateE48 } from './certificate-e48.ts';
import { renderConvictsList } from './convicts-list.ts';
import { renderRegister } from './register.ts';
import { buildDocx, loadWordFonts, obfuscateFont, type WordDoc } from './word.ts';
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

const open = (doc: WordDoc) => DocxZip.read(buildDocx(doc));
const body = (doc: WordDoc) => open(doc).getText('word/document.xml')!;
const plain = (doc: WordDoc) => visibleText(body(doc));

test('a built .docx is a zip with every part Word needs, all well-formed XML', () => {
  const zip = open({ landscape: false, blocks: [{ kind: 'para', text: 'Hello' }] });
  for (const part of [
    '[Content_Types].xml',
    '_rels/.rels',
    'word/document.xml',
    'word/styles.xml',
    'word/footer1.xml',
    'word/_rels/document.xml.rels',
  ]) {
    assert.ok(zip.has(part), part);
    assert.equal(xmlProblem(zip.getText(part)!), null, part);
  }
  assert.match(zip.getText('word/footer1.xml')!, /PAGE[\s\S]*NUMPAGES/);
});

test('Sinhala uses Noto Sans Sinhala (hAnsi and cs slots), ASCII Times New Roman; nothing embedded by default', () => {
  const zip = open({ landscape: false, blocks: [{ kind: 'para', text: 'මීගමුව Negombo' }] });
  const rFonts =
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Noto Sans Sinhala" w:eastAsia="Times New Roman" w:cs="Noto Sans Sinhala"/>';
  assert.ok(zip.getText('word/document.xml')!.includes(rFonts));
  assert.ok(zip.getText('word/styles.xml')!.includes(rFonts));
  assert.ok(!zip.getText('word/document.xml')!.includes('Iskoola Pota'));
  assert.ok(!zip.has('word/fontTable.xml'));
});

test('with fonts, the Sinhala font is embedded obfuscated and Word is told to keep it', async () => {
  const fonts = await loadWordFonts(join(import.meta.dirname, 'fonts'));
  assert.ok(fonts, 'print-layouts/fonts is missing; run scripts/make-word-fonts.ts');
  const zip = DocxZip.read(
    buildDocx({ landscape: false, blocks: [{ kind: 'para', text: 'මීගමුව' }] }, fonts),
  );
  for (const part of [
    '[Content_Types].xml',
    'word/_rels/document.xml.rels',
    'word/fontTable.xml',
    'word/_rels/fontTable.xml.rels',
    'word/settings.xml',
  ]) {
    assert.equal(xmlProblem(zip.getText(part)!), null, part);
  }
  assert.match(zip.getText('[Content_Types].xml')!, /Extension="odttf"[^>]*obfuscatedFont/);
  assert.match(zip.getText('word/_rels/document.xml.rels')!, /fontTable[\s\S]*settings/);
  assert.match(zip.getText('word/settings.xml')!, /<w:embedTrueTypeFonts\/>/);
  const table = zip.getText('word/fontTable.xml')!;
  assert.match(
    table,
    /<w:font w:name="Noto Sans Sinhala">[\s\S]*<w:embedRegular r:id="rId1"[\s\S]*<w:embedBold r:id="rId2"/,
  );

  // De-obfuscating with the key from fontTable.xml gives back the original font, byte for byte.
  const key = table.match(/w:embedRegular r:id="rId1" w:fontKey="([^"]+)"/)![1]!;
  const stored = zip.get('word/fonts/font1.odttf')!;
  assert.ok(!stored.equals(fonts.regular));
  assert.ok(obfuscateFont(stored, key).equals(fonts.regular));
  assert.ok(zip.get('word/fonts/font2.odttf')!.subarray(32).equals(fonts.bold.subarray(32)));
});

test('obfuscation XORs the first 32 bytes with the GUID bytes in reverse order', () => {
  const out = obfuscateFont(Buffer.alloc(40), '{00112233-4455-6677-8899-AABBCCDDEEFF}');
  assert.deepEqual([...out.subarray(0, 4)], [0xff, 0xee, 0xdd, 0xcc]);
  assert.deepEqual([...out.subarray(16, 20)], [0xff, 0xee, 0xdd, 0xcc]);
  assert.equal(out[15], 0x00);
  assert.ok(out.subarray(32).every((b) => b === 0));
});

test('text is escaped, control characters dropped, page orientation set', () => {
  const doc: WordDoc = {
    landscape: true,
    blocks: [{ kind: 'para', text: 'A & B <c> "d"\u0001' }],
  };
  const xml = body(doc);
  assert.equal(xmlProblem(xml), null);
  assert.ok(xml.includes('A &amp; B &lt;c&gt; &quot;d&quot;'));
  assert.ok(!xml.includes('\u0001'));
  assert.match(xml, /w:orient="landscape"/);
  assert.match(body({ landscape: false, blocks: [] }), /<w:pgSz w:w="11906" w:h="16838"\/>/);
});

test('tables repeat the header row and keep the total row last', () => {
  const xml = body({
    landscape: true,
    blocks: [
      {
        kind: 'table',
        header: [{ text: 'H1' }, { text: 'H2' }],
        rows: [[{ text: 'a' }, { text: 'b', align: 'right' }]],
        footer: [{ text: '' }, { text: 'TOTAL', align: 'right' }],
      },
    ],
  });
  assert.equal(xmlProblem(xml), null);
  assert.equal(xml.match(/<w:tblHeader\/>/g)?.length, 1);
  assert.ok(xml.indexOf('H1') < xml.indexOf('>a<'));
  assert.ok(xml.indexOf('>b<') < xml.indexOf('TOTAL'));
});

test('ඊ 48 in Word: all wording, values in old formats, ticks, a page break between certificates', () => {
  const layout = renderCertificateE48([row(), row({ accusedName: 'B' })]);
  assert.equal(layout.word.landscape, false);
  const t = plain(layout.word);
  for (const value of Object.values(E48)) assert.ok(t.includes(value), value);
  assert.ok(t.includes('2026.03.10'));
  assert.ok(t.includes(`${E48.fine} 25000`));
  assert.ok(t.includes(`☑  ${E48.communityService}`));
  assert.ok(t.includes(`☐  ${E48.imprisonment}`));
  assert.equal(body(layout.word).match(/<w:pageBreakBefore\/>/g)?.length, 1);
  assert.equal(xmlProblem(body(layout.word)), null);
});

test('convicts list in Word: every caption, a row per conviction, vertical sentence captions', () => {
  const layout = renderConvictsList([row(), row({ crNumber: '13/2026' })], {
    year: 2026,
    month: 3,
    officeName: 'Negombo',
  });
  const xml = body(layout.word);
  assert.equal(xmlProblem(xml), null);
  assert.equal(layout.word.landscape, true);
  const t = plain(layout.word);
  // registerTitle is only the heading of a whole-year list
  for (const [key, value] of Object.entries(CONVICTS_LIST)) {
    if (key !== 'registerTitle') assert.ok(t.includes(value), `${key}: ${value}`);
  }
  assert.ok(t.includes('Negombo') && t.includes('12/2026') && t.includes('13/2026'));
  assert.equal(xml.match(/<w:tr>/g)?.length, 3); // header + 2 rows
  assert.equal(xml.match(/<w:textDirection w:val="btLr"\/>/g)?.length, 8);
});

test('register in Word: columns, formatted values, fine total, empty result', () => {
  const result: ReportResult = {
    columns: [
      { key: 'crNumber', labelKey: 'c.cr' },
      { key: 'accusedName', labelKey: 'c.name' },
      { key: 'fineAmount', labelKey: 'c.fine' },
    ],
    rows: [{ crNumber: '1/2026', accusedName: 'X & Y', fineAmount: 150000 }],
    fineTotal: 150000,
  } as unknown as ReportResult;
  const layout = renderRegister(result, {
    title: 'Register',
    subtitle: ['Negombo', '2026'],
    caption: (k) => `[${k}]`,
  });
  const xml = body(layout.word);
  assert.equal(xmlProblem(xml), null);
  const t = plain(layout.word);
  for (const s of ['Register', 'Negombo', '2026', '[c.cr]', '1/2026', 'X & Y', '1500']) {
    assert.ok(t.includes(s), s);
  }
  assert.equal(xml.match(/1500/g)?.length, 2); // the row and the total

  const empty = renderRegister(
    { ...result, rows: [], fineTotal: 0 },
    { title: 'Register', caption: (k) => k },
  );
  assert.ok(!body(empty.word).includes('<w:tbl>'));
  assert.equal(xmlProblem(body(empty.word)), null);
});
