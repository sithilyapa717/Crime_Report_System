// Fidelity tests (D7): for every frozen template, the generated document must keep the
// template's wording exactly, with each merge field replaced by its value in the same place.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fillTemplate } from '../../packages/documents/engine/fill.ts';
import { DocxZip } from '../../packages/documents/engine/zip.ts';
import { FIELDS, formatValue, lookupField } from '../../packages/documents/mapping/fields.ts';
import type { DocumentData } from '../../packages/documents/engine/fill.ts';
import { CONTENT_PART, plainText, textWithFields, xmlProblem } from './fidelity-lib.ts';

const ORIGINALS = join(import.meta.dirname, '..', '..', 'packages', 'documents', 'templates', 'original');
const manifest = JSON.parse(readFileSync(join(ORIGINALS, 'MANIFEST.json'), 'utf8')) as {
  files: { path: string }[];
};

// Marker values: each text field gets its own visible marker, so a value in the wrong place fails.
const DATA: DocumentData = {};
for (const f of FIELDS) {
  DATA[f.name] =
    f.kind === 'date' ? '2026-01-02' : f.kind === 'time' ? '01:02' : f.kind === 'money' ? 123400 : `⟦${f.name}⟧`;
}

function expectedValue(templateName: string): string {
  const def = lookupField(templateName);
  assert.ok(def, `field ${templateName} is not in the mapping`);
  return formatValue(def, DATA[def.name]) ?? '';
}

const EDITED = new Set(['word/settings.xml', 'word/_rels/settings.xml.rels']);

for (const { path } of manifest.files) {
  test(`fidelity: ${path}`, () => {
    const original = readFileSync(join(ORIGINALS, path));
    const { docx, report } = fillTemplate(original, DATA);
    const before = DocxZip.read(original);
    const after = DocxZip.read(docx);

    assert.deepEqual(report.unknown, [], 'every field is mapped');
    assert.deepEqual(report.unsupported, [], 'no unsupported (nested) merge fields');
    assert.deepEqual(after.names(), before.names(), 'same parts in the same order');

    for (const name of before.names()) {
      if (CONTENT_PART.test(name)) {
        const out = after.getText(name) ?? '';
        assert.equal(
          plainText(out),
          textWithFields(before.getText(name) ?? '', expectedValue),
          `${name}: wording or field positions changed`,
        );
        assert.doesNotMatch(out, /MERGEFIELD/, `${name}: merge field left in output`);
        assert.equal(xmlProblem(out), null, `${name}: XML is not well-formed`);
      } else if (EDITED.has(name)) {
        const out = after.getText(name) ?? '';
        assert.doesNotMatch(out, /<w:mailMerge\b|relationships\/mailMergeSource/, `${name}: Access link left`);
        assert.equal(xmlProblem(out), null, `${name}: XML is not well-formed`);
      } else {
        const a = before.entries.find((e) => e.name === name);
        const b = after.entries.find((e) => e.name === name);
        assert.ok(a && b && a.compressed.equals(b.compressed), `${name}: untouched part changed`);
      }
    }
  });
}
