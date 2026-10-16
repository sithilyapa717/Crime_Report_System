import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fillTemplateFromFields } from '../engine/fill.ts';
import { DocxZip } from '../engine/zip.ts';
import { TemplateRegistry, type TemplateEntry } from '../registry/registry.ts';
import { documentFileName, safeFilePart, withCopyNumber } from './filename.ts';
import { DocumentGenerator, GenerationError } from './generate.ts';
import { InMemoryGenerationLog, JsonLinesGenerationLog } from './log.ts';

const ORIGINALS = join(import.meta.dirname, '..', 'templates', 'original');
const PUDS = 'PUDS/puds  බෝතලය.docx';
const UPH = 'UPH/UPH.docx';

// Shape of DocDataService.buildFor (B8): strings keyed by merge-field name.
const FIELDS: Record<string, string> = {
  CR_NO_2017: '12/2026',
  Name_of_Accused: 'කේ. ඒ. සමන් කුමාර',
  Date_of_Detection: '2026.01.15',
  Quantity: '750',
  name_of_Suerty: 'ඩබ්. එම්. නිමල් සිල්වා',
};

const entry = (id: string, offenceCodes: string[], status: TemplateEntry['status'] = 'unconfirmed'): TemplateEntry => ({
  id,
  title: id.slice(id.indexOf('/') + 1).replace(/\.docx$/, ''),
  family: 'plaint',
  offenceCodes,
  variant: {},
  status,
});

function setup(entries: TemplateEntry[] = [entry(PUDS, ['PUDS']), entry(UPH, ['UPH'], 'archived')], originals = ORIGINALS) {
  const outputDir = mkdtempSync(join(tmpdir(), 'docs-out-'));
  const log = new InMemoryGenerationLog();
  const gen = new DocumentGenerator({
    registry: new TemplateRegistry(entries),
    originalsDir: originals,
    outputDir,
    log,
    now: () => new Date('2026-10-16T08:00:00Z'),
  });
  const req = {
    crimeReportId: 'cr-1',
    crNumber: '12/2026',
    offenceCode: 'PUDS',
    templateId: PUDS,
    fields: FIELDS,
    userId: 'user-1',
  };
  return { gen, log, outputDir, req };
}

test('file names: CR number first, Windows-safe, copies numbered', () => {
  assert.equal(documentFileName('12/2026', 'puds  බෝතලය'), 'CR 12-2026 - puds බෝතලය.docx');
  assert.equal(safeFilePart('a:b*c?. '), 'a-b-c-');
  assert.equal(withCopyNumber('x.docx', 1), 'x.docx');
  assert.equal(withCopyNumber('x.docx', 3), 'x (3).docx');
});

test('fillTemplateFromFields: exact name, then case and alias fallback; empty counts as missing', () => {
  const template = readFileSync(join(ORIGINALS, 'SUDS-PUDS/SUDS PUDS සාම්පල්.docx'));
  const { docx, report } = fillTemplateFromFields(template, { ...FIELDS, Name_of_Suerty: '' });
  const doc = DocxZip.read(docx).getText('word/document.xml') ?? '';
  // the template uses both name_of_Suerty and Name_of_Suerty; both get the one non-empty value
  assert.equal(doc.split('ඩබ්. එම්. නිමල් සිල්වා').length - 1 >= 2, true);
  assert.ok(report.missing.includes('Address_of_Accused'));
  assert.ok(!report.missing.includes('Name_of_Suerty'));
});

test('generates a CR-named file and logs it', async () => {
  const { gen, log, req } = setup();
  const out = await gen.generate(req);
  assert.equal(out.fileName, 'CR 12-2026 - puds බෝතලය.docx');
  const doc = DocxZip.read(readFileSync(out.filePath)).getText('word/document.xml') ?? '';
  assert.ok(doc.includes('කේ. ඒ. සමන් කුමාර'));
  assert.deepEqual(await log.forCrimeReport('cr-1'), [out.logEntry]);
  assert.equal(out.logEntry.generatedBy, 'user-1');
  assert.equal(out.logEntry.generatedAt, '2026-10-16T08:00:00.000Z');
  assert.ok(out.warnings.some((w) => w.code === 'unconfirmed'));
});

test('regenerating never overwrites: the second file gets (2)', async () => {
  const { gen, outputDir, req } = setup();
  const first = await gen.generate(req);
  const firstBytes = readFileSync(first.filePath);
  const second = await gen.generate({ ...req, fields: { ...FIELDS, Quantity: '999' } });
  assert.equal(second.fileName, 'CR 12-2026 - puds බෝතලය (2).docx');
  assert.ok(readFileSync(first.filePath).equals(firstBytes));
  assert.equal(readdirSync(outputDir).length, 2);
});

test('refuses archived templates, unknown templates and the wrong offence', async () => {
  const { gen, req } = setup();
  await assert.rejects(gen.generate({ ...req, templateId: UPH, offenceCode: 'UPH' }), /archived/);
  await assert.rejects(gen.generate({ ...req, templateId: 'nope.docx' }), GenerationError);
  await assert.rejects(gen.generate({ ...req, offenceCode: 'UPH' }), /not for offence UPH/);
  const forced = await gen.generate({ ...req, offenceCode: 'UPH', allowOtherOffence: true });
  assert.ok(forced.warnings.some((w) => w.code === 'other_offence' && /template is for PUDS/.test(w.detail)));
});

test('refuses a template file that no longer matches MANIFEST.json', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'docs-orig-'));
  copyFileSync(join(ORIGINALS, 'MANIFEST.json'), join(dir, 'MANIFEST.json'));
  mkdirSync(join(dir, 'PUDS'));
  writeFileSync(join(dir, PUDS), Buffer.concat([readFileSync(join(ORIGINALS, PUDS)), Buffer.from([0])]));
  const { gen, req } = setup(undefined, dir);
  await assert.rejects(gen.generate(req), /template file was changed/);
});

test('PDF: exporter result is logged; a failing exporter keeps the .docx and warns', async () => {
  const { req } = setup();
  const make = (pdfExporter: (p: string) => Promise<string>) =>
    new DocumentGenerator({
      registry: new TemplateRegistry([entry(PUDS, ['PUDS'])]),
      originalsDir: ORIGINALS,
      outputDir: mkdtempSync(join(tmpdir(), 'docs-pdf-')),
      log: new InMemoryGenerationLog(),
      pdfExporter,
    });
  const ok = await make(async (p) => p.replace(/\.docx$/, '.pdf')).generate({ ...req, pdf: true });
  assert.equal(ok.logEntry.pdfPath, ok.filePath.replace(/\.docx$/, '.pdf'));
  const failed = await make(async () => {
    throw new Error('Word crashed');
  }).generate({ ...req, pdf: true });
  assert.ok(readFileSync(failed.filePath).length > 0);
  assert.ok(failed.warnings.some((w) => w.code === 'pdf_failed' && /Word crashed/.test(w.detail)));
  assert.equal(failed.logEntry.pdfPath, undefined);
});

test('JSON-lines log appends and reads back per CR', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'docs-log-')), 'sub', 'generated.jsonl');
  const log = new JsonLinesGenerationLog(file);
  assert.deepEqual(await log.forCrimeReport('cr-1'), []);
  const { gen, req } = setup();
  const a = (await gen.generate(req)).logEntry;
  const b = { ...a, id: 'other', crimeReportId: 'cr-2' };
  await log.append(a);
  await log.append(b);
  assert.deepEqual(await log.forCrimeReport('cr-1'), [a]);
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 2);
});
