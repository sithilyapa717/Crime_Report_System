import assert from 'node:assert/strict';
import { test } from 'node:test';
import { familyFor, inferEntry, offencesFor, variantFor } from './infer.ts';
import { TemplateRegistry, type TemplateEntry } from './registry.ts';
import { applyReview, parseCsv } from './review.ts';

test('infer: offence codes from folder and name', () => {
  assert.deepEqual(offencesFor('PUDS', 'puds කෑනය').codes, ['PUDS']);
  assert.deepEqual(offencesFor('SUDS-PUDS', 'x').codes, ['SUDS', 'PUDS']);
  assert.deepEqual(offencesFor('USA-UPA', 'USFL UPFL excibeter').codes, ['USFL', 'UPFL']);
  assert.deepEqual(offencesFor('USA-UPA', 'UPA new').codes, ['UPA']);
  assert.deepEqual(offencesFor('GOLD LEAF', '460, 461 PDFC').codes, ['PDFC']);
  const unknown = offencesFor('GOLD LEAF', 'beedi');
  assert.deepEqual(unknown.codes, []);
  assert.match(unknown.note ?? '', /to confirm/);
  assert.deepEqual(offencesFor('REWARDS', 'REWARD දඩ').codes, []);
});

test('infer: family from folder and name', () => {
  assert.equal(familyFor('REWARDS', 'REWARD දඩ'), 'reward-voucher');
  assert.equal(familyFor('Warrant', 'මොෂන්  කොළ'), 'motion-sheet');
  assert.equal(familyFor('Warrant', 'හිස් මෝෂන් කොළ'), 'motion-sheet');
  assert.equal(familyFor('Warrant', 'වරෙන්තු දිර්ග කිරීම'), 'warrant-extension');
  assert.equal(familyFor('Warrant', 'පෙර වැරදි නොමැති බව'), 'previous-record');
  assert.equal(familyFor('PUMB 2021.02.11', 'චෝදනා පත්'), 'charge-sheet');
  assert.equal(familyFor('(root)', 'හිස් සාක්ෂි භාණ්ඩ රැගෙන ඒම (1)'), 'production');
  assert.equal(familyFor('PUDS', 'puds  බෝතලය'), 'plaint');
});

test('infer: variants, including the can-with-sample-bottle case and bare numbers', () => {
  assert.deepEqual(variantFor('puds කෑනය සාම්පල් බෝතලය'), { container: 'can', sample: true });
  assert.deepEqual(variantFor('SUDS PUDS  සාම්පල් නැත'), { sample: false });
  assert.deepEqual(variantFor('usa බෝතලය 375 රු 1000 නෝට්ටුව'), { container: 'bottle', volumeMl: 375, noteRs: 1000 });
  assert.deepEqual(variantFor('UMA NEW 4 OFFENCE 1'), { offences: 4 });
  assert.deepEqual(variantFor('usfl new කෑනය 500'), { container: 'can' }, 'a bare 500 is not assumed to be a note');
  assert.match(inferEntry('USFL/usfl new කෑනය 500.docx').notes ?? '', /note value \(Rs\) or volume \(ml\)/);
  assert.match(inferEntry('GOLD LEAF/FORRIN SIGERAT AC OFFICE.docx 1.docx').notes ?? '', /saved-again copy/);
  assert.equal(inferEntry('PUDS/puds  බෝතලය.docx').notes, undefined);
});

const e = (id: string, offenceCodes: string[], family: TemplateEntry['family'] = 'plaint'): TemplateEntry => ({
  id,
  title: id,
  family,
  offenceCodes,
  variant: {},
  status: 'unconfirmed',
});

test('registry: lower-case and empty offence codes', () => {
  const r = new TemplateRegistry([e('p', ['PUDS']), e('v', [], 'reward-voucher'), e('cig', [])]);
  assert.deepEqual(r.forOffence('puds').map((x) => x.id), ['p', 'v']);
  assert.deepEqual(r.forOffence('').map((x) => x.id), ['v'], 'a CR without offence only gets general documents');
  assert.equal(r.get('missing'), undefined);
  assert.equal(r.all().length, 3);
});

test('review sheet: quoted new lines, CRLF, no BOM, synonyms, duplicate rows (last wins)', () => {
  const csv =
    'Template id,Decision: current / old copy,Correct offence codes,Comments\r\n' +
    'p,yes,,"two\r\nlines"\r\n' +
    'cig,,"pumb; pdfc",\r\n' +
    'v,current,,\r\n' +
    'v,old,,\r\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 4);
  assert.equal(rows[0]?.['Comments'], 'two\r\nlines');
  const r = applyReview([e('p', ['PUDS']), e('cig', []), e('v', [], 'reward-voucher')], rows);
  assert.deepEqual(r.errors, []);
  const byId = Object.fromEntries(r.entries.map((x) => [x.id, x]));
  assert.equal(byId.p?.status, 'current');
  assert.match(byId.p?.notes ?? '', /staff: two/);
  assert.deepEqual(byId.cig?.offenceCodes, ['PUMB', 'PDFC']);
  assert.equal(byId.v?.status, 'archived');
});

test('review sheet: a tab-separated sheet and blank lines', () => {
  const rows = parseCsv('Template id\tDecision: current / old copy\n\np\tcurrent\n\n');
  assert.deepEqual(rows, [{ 'Template id': 'p', 'Decision: current / old copy': 'current' }]);
  assert.deepEqual(parseCsv(''), []);
});

test('review sheet: applying the same comment twice does not repeat it', () => {
  const rows = [{ 'Template id': 'p', Comments: 'ok' }];
  const once = applyReview([e('p', ['PUDS'])], rows).entries;
  const twice = applyReview(once, rows);
  assert.equal(twice.entries[0]?.notes, 'staff: ok');
  assert.deepEqual(twice.changed, []);
});
