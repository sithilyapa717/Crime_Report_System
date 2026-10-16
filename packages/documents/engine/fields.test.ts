import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeFieldName, replaceMergeFields } from './fields.ts';
import { visibleText } from './xml.ts';

const rPr = '<w:rPr><w:rFonts w:ascii="Maiandra GD" w:cs="Iskoola Pota"/><w:sz w:val="28"/></w:rPr>';
const run = (inner: string) => `<w:r>${rPr}${inner}</w:r>`;
const begin = run('<w:fldChar w:fldCharType="begin"/>');
const sep = run('<w:fldChar w:fldCharType="separate"/>');
const end = run('<w:fldChar w:fldCharType="end"/>');
const instr = (s: string) => run(`<w:instrText xml:space="preserve">${s}</w:instrText>`);
const text = (s: string) => run(`<w:t xml:space="preserve">${s}</w:t>`);
const para = (...parts: string[]) => `<w:p>${parts.join('')}</w:p>`;
const values: Record<string, string> = { Quantity: '750', Name_of_Accused: 'කේ. සමන්' };
const resolve = (n: string) => values[n];

test('mergeFieldName reads plain, quoted and switched instructions', () => {
  assert.equal(mergeFieldName(' MERGEFIELD Quantity '), 'Quantity');
  assert.equal(mergeFieldName(' MERGEFIELD "Name_of_Accused" \\* MERGEFORMAT '), 'Name_of_Accused');
  assert.equal(mergeFieldName(' PAGE '), null);
});

test('complex field: code removed, result replaced, formatting kept', () => {
  const xml = para(text('මිලි ලීටර් '), begin, instr(' MERGEFIELD Quantity '), sep, text('330'), end, text(' ක්'));
  const out = replaceMergeFields(xml, resolve);
  assert.equal(visibleText(out.xml), 'මිලි ලීටර් 750 ක්\n');
  assert.doesNotMatch(out.xml, /fldChar|instrText/);
  assert.equal(out.xml, para(text('මිලි ලීටර් '), text('750'), text(' ක්')));
  assert.deepEqual(out.occurrences.map((o) => o.name), ['Quantity']);
});

test('instruction split over several runs', () => {
  const xml = para(begin, instr(' MERGE'), instr('FIELD Name_of'), instr('_Accused '), sep, text('x'), end);
  assert.equal(visibleText(replaceMergeFields(xml, resolve).xml), 'කේ. සමන්\n');
});

test('field without a result part gets a run with the instruction run formatting', () => {
  const xml = para(begin, instr(' MERGEFIELD Quantity '), end);
  assert.equal(replaceMergeFields(xml, resolve).xml, para(text('750')));
});

test('only the first result run keeps text; extra result runs go', () => {
  const xml = para(begin, instr(' MERGEFIELD Quantity '), sep, text('3'), text('30'), end);
  assert.equal(replaceMergeFields(xml, resolve).xml, para(text('750')));
});

test('non-run content inside and around the field is kept', () => {
  const bm = '<w:bookmarkStart w:id="0" w:name="b"/>';
  const xml = para('<w:proofErr w:type="spellStart"/>', begin, bm, instr(' MERGEFIELD Quantity '), sep, text('1'), end);
  const out = replaceMergeFields(xml, resolve).xml;
  assert.ok(out.includes(bm));
  assert.ok(out.includes('<w:proofErr w:type="spellStart"/>'));
});

test('simple field is unwrapped and its run formatting kept', () => {
  const xml = para(`<w:fldSimple w:instr=" MERGEFIELD Quantity ">${text('330')}</w:fldSimple>`);
  assert.equal(replaceMergeFields(xml, resolve).xml, para(text('750')));
});

test('missing value leaves an empty run, like a Word merge', () => {
  const xml = para(begin, instr(' MERGEFIELD dh5 '), sep, text('old'), end);
  assert.equal(visibleText(replaceMergeFields(xml, resolve).xml), '\n');
});

test('values are XML-escaped; new lines and tabs become w:br and w:tab', () => {
  const xml = para(begin, instr(' MERGEFIELD Quantity '), sep, text('1'), end);
  const out = replaceMergeFields(xml, () => 'a & <b>\nc\td').xml;
  assert.match(out, /a &amp; &lt;b&gt;<\/w:t><w:br\/><w:t xml:space="preserve">c<\/w:t><w:tab\/>/);
  assert.equal(visibleText(out), 'a & <b>\nc\td\n');
});

test('non-merge fields are left alone', () => {
  const xml = para(begin, instr(' PAGE '), sep, text('1'), end);
  assert.equal(replaceMergeFields(xml, resolve).xml, xml);
});

test('a merge field nested in another field is reported and not touched', () => {
  const xml = para(begin, instr(' IF '), begin, instr(' MERGEFIELD Quantity '), sep, text('1'), end, instr(' = 1 "a" "b" '), sep, text('a'), end);
  const out = replaceMergeFields(xml, resolve);
  assert.equal(out.xml, xml);
  assert.deepEqual(out.unsupported, ['Quantity']);
});
