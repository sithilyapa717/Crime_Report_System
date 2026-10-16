import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fillTemplate, fillTemplateFromFields, removeMailMergeLink } from '../engine/fill.ts';
import { DocxZip } from '../engine/zip.ts';
import { TemplateRegistry, type TemplateEntry } from '../registry/registry.ts';
import { documentFileName, safeFilePart } from './filename.ts';
import { DocumentGenerator } from './generate.ts';
import { InMemoryGenerationLog, JsonLinesGenerationLog } from './log.ts';

const ORIGINALS = join(import.meta.dirname, '..', 'templates', 'original');
const PUDS = 'PUDS/puds  බෝතලය.docx';
const entry = (id: string, offenceCodes: string[]): TemplateEntry => ({
  id,
  title: id.slice(id.indexOf('/') + 1).replace(/\.docx$/, ''),
  family: 'plaint',
  offenceCodes,
  variant: {},
  status: 'current',
});

/** A copy of the PUDS template with document.xml changed, registered in a private originals folder. */
function customTemplate(edit: (xml: string) => string) {
  const dir = mkdtempSync(join(tmpdir(), 'docs-custom-'));
  mkdirSync(join(dir, 'PUDS'));
  const zip = DocxZip.read(readFileSync(join(ORIGINALS, PUDS)));
  zip.setText('word/document.xml', edit(zip.getText('word/document.xml') ?? ''));
  const bytes = zip.write();
  writeFileSync(join(dir, PUDS), bytes);
  writeFileSync(
    join(dir, 'MANIFEST.json'),
    JSON.stringify({ files: [{ path: PUDS, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }] }),
  );
  return { dir, bytes };
}

function generator(originalsDir = ORIGINALS) {
  return new DocumentGenerator({
    registry: new TemplateRegistry([entry(PUDS, ['PUDS'])]),
    originalsDir,
    outputDir: mkdtempSync(join(tmpdir(), 'docs-gen-')),
    log: new InMemoryGenerationLog(),
  });
}
const REQ = { crimeReportId: 'cr', crNumber: '1/2026', offenceCode: 'PUDS', templateId: PUDS, fields: { Name_of_Accused: 'x' }, userId: 'u' };

test('refuses a template with a field it cannot fill, and writes nothing', async () => {
  const { dir } = customTemplate((xml) => xml.replace(/MERGEFIELD Quantity /, 'MERGEFIELD Quantity \\b "Qty: " '));
  const gen = generator(dir);
  await assert.rejects(gen.generate(REQ), /cannot fill: Quantity/);
});

test('refuses a CR without a CR number', async () => {
  await assert.rejects(generator().generate({ ...REQ, crNumber: '  ' }), /no CR number/);
});

test('a template using a field the mapping does not know is refused', async () => {
  const { dir, bytes } = customTemplate((xml) => xml.replace(/MERGEFIELD Quantity /, 'MERGEFIELD Not_A_Field '));
  assert.throws(() => fillTemplateFromFields(bytes, {}), /not in the mapping: Not_A_Field/);
  assert.throws(() => fillTemplate(bytes, {}), /not in the mapping/);
  await assert.rejects(generator(dir).generate(REQ), /not in the mapping/);
});

test('two generations at the same moment get two different files', async () => {
  const gen = generator();
  const [a, b] = await Promise.all([gen.generate(REQ), gen.generate(REQ)]);
  assert.notEqual(a.filePath, b.filePath);
  assert.deepEqual([a.fileName, b.fileName].sort(), ['CR 1-2026 - puds බෝතලය (2).docx', 'CR 1-2026 - puds බෝතලය.docx']);
});

test('the generated file is a valid docx with the value and without the Access link', async () => {
  const out = await generator().generate(REQ);
  const zip = DocxZip.read(readFileSync(out.filePath));
  assert.ok((zip.getText('word/document.xml') ?? '').includes('>x<'));
  assert.doesNotMatch(zip.getText('word/settings.xml') ?? '', /mailMerge/);
  assert.equal(out.logEntry.sha256, createHash('sha256').update(readFileSync(out.filePath)).digest('hex'));
});

test('removeMailMergeLink keeps relationships that are not the mail-merge source', () => {
  const zip = DocxZip.read(readFileSync(join(ORIGINALS, PUDS)));
  const rels = zip.getText('word/_rels/settings.xml.rels') ?? '';
  zip.setText(
    'word/_rels/settings.xml.rels',
    rels.replace('</Relationships>', '<Relationship Id="rId99" Type="http://x/attachedTemplate" Target="t.dotx"/></Relationships>'),
  );
  assert.equal(removeMailMergeLink(zip), true);
  const after = zip.getText('word/_rels/settings.xml.rels') ?? '';
  assert.match(after, /rId99/);
  assert.doesNotMatch(after, /mailMergeSource/);
  assert.equal(removeMailMergeLink(zip), false, 'nothing left to remove the second time');
});

test('file names: Windows-unsafe characters, control characters, trailing dots', () => {
  assert.equal(safeFilePart('a\u0001b\tc'), 'a-b-c');
  assert.equal(safeFilePart('name...'), 'name');
  assert.equal(documentFileName('12/2026', 'x: "y"?'), 'CR 12-2026 - x- -y--.docx');
  assert.equal(documentFileName('7/2026', 'පෙර වැරදි', 'pdf'), 'CR 7-2026 - පෙර වැරදි.pdf');
});

test('JSON-lines log keeps Sinhala and quotes intact', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'docs-log2-')), 'log.jsonl');
  const log = new JsonLinesGenerationLog(file);
  const out = await generator().generate(REQ);
  const entry2 = { ...out.logEntry, fileName: 'CR 1-2026 - "පෙර වැරදි".docx' };
  await log.append(entry2);
  assert.deepEqual(await log.forCrimeReport('cr'), [entry2]);
});

test('a template copied in place of an original with the same name is caught by its hash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'docs-swap-'));
  mkdirSync(join(dir, 'PUDS'));
  copyFileSync(join(ORIGINALS, 'MANIFEST.json'), join(dir, 'MANIFEST.json'));
  copyFileSync(join(ORIGINALS, 'PUDS', 'puds කෑනය.docx'), join(dir, PUDS)); // a different real template
  await assert.rejects(generator(dir).generate(REQ), /template file was changed/);
  assert.equal(readdirSync(dir).length, 2);
});
