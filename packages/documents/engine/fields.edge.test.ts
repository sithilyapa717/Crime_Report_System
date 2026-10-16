// Edge cases for the field engine found in the full review: text boxes, switches, mixed runs,
// fields across paragraphs, odd instructions, and characters XML does not allow.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { xmlProblem } from '../../../tests/documents-fidelity/fidelity-lib.ts';
import { replaceMergeFields, unsupportedSwitches } from './fields.ts';
import { cleanText, visibleText } from './xml.ts';

const run = (inner: string) => `<w:r><w:rPr><w:b/></w:rPr>${inner}</w:r>`;
const begin = run('<w:fldChar w:fldCharType="begin"/>');
const sep = run('<w:fldChar w:fldCharType="separate"/>');
const end = run('<w:fldChar w:fldCharType="end"/>');
const instr = (s: string) => run(`<w:instrText xml:space="preserve">${s}</w:instrText>`);
const text = (s: string) => run(`<w:t xml:space="preserve">${s}</w:t>`);
const para = (...parts: string[]) => `<w:p>${parts.join('')}</w:p>`;
const field = (name: string, old = 'old') => [begin, instr(` MERGEFIELD ${name} `), sep, text(old), end].join('');
const values: Record<string, string> = { A: 'ALPHA', B: 'BETA', Quantity: '750' };
const resolve = (n: string) => values[n];
const body = (xml: string) => `<w:body>${xml}</w:body>`;

/** A run holding a text box (DrawingML choice + VML fallback), like the templates use. */
function textBoxRun(inner: string): string {
  const box = `<w:txbxContent>${inner}</w:txbxContent>`;
  return (
    `<w:r><w:rPr/><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><a:graphic><a:graphicData>` +
    `<wps:wsp><wps:txbx>${box}</wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>` +
    `<mc:Fallback><w:pict><v:shape><v:textbox>${box}</v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`
  );
}

test('a field that is the first thing in a text box is filled and the text box stays intact', () => {
  const xml = body(para(text('before '), textBoxRun(para(field('A'), text(' after'))), text(' end')));
  const out = replaceMergeFields(xml, resolve).xml;
  assert.equal(xmlProblem(out), null, 'well-formed');
  assert.equal(out.match(/<w:drawing>/g)?.length, 1, 'drawing kept');
  assert.equal(out.match(/<w:txbxContent>/g)?.length, 2, 'both text box copies kept');
  // the value appears in both the DrawingML and the VML copy, the field code nowhere
  assert.equal(out.match(/ALPHA/g)?.length, 2);
  assert.doesNotMatch(out, /fldChar|instrText|>old</);
  assert.equal(visibleText(out), 'before ALPHA after\nALPHA after\n end\n');
});

test('several fields in one text box and next to each other', () => {
  const xml = body(para(textBoxRun(para(field('A'), field('B'), text(' / '), field('Quantity')))));
  const out = replaceMergeFields(xml, resolve).xml;
  assert.equal(xmlProblem(out), null);
  assert.equal(visibleText(out), 'ALPHABETA / 750\nALPHABETA / 750\n\n');
});

test('a field spanning two paragraphs keeps both paragraphs and puts the value where the field ends', () => {
  const xml = body(para(text('x '), begin, instr(' MERGEFIELD A '), sep, text('old')) + para(end, text(' y')));
  const out = replaceMergeFields(xml, resolve).xml;
  assert.equal(xmlProblem(out), null);
  assert.equal(visibleText(out), 'x \nALPHA y\n');
});

test('instruction with an entity-quoted name and extra spaces', () => {
  const xml = para(begin, instr(' MERGEFIELD  &quot;A&quot;   \\* MERGEFORMAT '), sep, text('o'), end);
  assert.equal(visibleText(replaceMergeFields(xml, resolve).xml), 'ALPHA\n');
});

test('switches that change the printed text are reported, not applied', () => {
  assert.deepEqual(unsupportedSwitches(' MERGEFIELD A \\* MERGEFORMAT '), []);
  assert.deepEqual(unsupportedSwitches(' MERGEFIELD A \\*MERGEFORMAT '), [], 'no space after \\* is fine too');
  assert.deepEqual(unsupportedSwitches(' MERGEFIELD "A B" \\* CHARFORMAT '), []);
  assert.deepEqual(unsupportedSwitches(' MERGEFIELD A \\b "Mr. " '), ['\\b "Mr. "']);
  assert.deepEqual(unsupportedSwitches(' MERGEFIELD A \\* Upper \\* MERGEFORMAT '), ['\\* Upper']);
  assert.deepEqual(unsupportedSwitches(' MERGEFIELD D \\@ "yyyy.MM.dd" '), ['\\@ "yyyy.MM.dd"']);

  const complex = para(begin, instr(' MERGEFIELD A \\b "Mr. " '), sep, text('old'), end);
  const c = replaceMergeFields(complex, resolve);
  assert.equal(c.xml, complex, 'left exactly as it was');
  assert.deepEqual(c.unsupported, ['A']);

  const simple = para(`<w:fldSimple w:instr=" MERGEFIELD B \\* Upper ">${text('old')}</w:fldSimple>`);
  const s = replaceMergeFields(simple, resolve);
  assert.equal(s.xml, simple);
  assert.deepEqual(s.unsupported, ['B']);
});

test('a run that mixes a field character with text is refused instead of losing the text', () => {
  const xml = para(run('<w:t>keep me</w:t><w:fldChar w:fldCharType="begin"/>'), instr(' MERGEFIELD A '), end);
  assert.throws(() => replaceMergeFields(xml, resolve), /fldChar and text/);
});

test('a field that never ends is an error, not a silent cut', () => {
  assert.throws(() => replaceMergeFields(para(begin, instr(' MERGEFIELD A '), sep, text('x')), resolve), /without end/);
});

test('an empty template part and a part without fields come back unchanged', () => {
  assert.equal(replaceMergeFields('', resolve).xml, '');
  const plain = body(para(text('nothing to fill'), '<w:bookmarkStart w:id="1" w:name="b"/>'));
  assert.equal(replaceMergeFields(plain, resolve).xml, plain);
});

test('values with characters XML does not allow are cleaned; Word line and page breaks become line breaks', () => {
  const xml = para(begin, instr(' MERGEFIELD A '), sep, text('o'), end);
  const out = replaceMergeFields(xml, () => 'line1\u000Bline2\u000Cline3\u0001\u0008x\uD800y').xml;
  assert.equal(xmlProblem(out), null);
  assert.doesNotMatch(out, /[\u0001\u0008\u000B\u000C\uD800]/);
  assert.equal(visibleText(out), 'line1\nline2\nline3xy\n');
});

test('cleanText keeps Sinhala, tabs, emoji and joiners; drops controls and lone surrogates', () => {
  assert.equal(cleanText('ශ්‍රී ලංකා\tok'), 'ශ්‍රී ලංකා\tok', 'ZWJ (U+200D) in ශ්‍රී is kept');
  assert.equal(cleanText('a😀b'), 'a😀b');
  assert.equal(cleanText('a\u0000b\u001Fc\uDFFFd￾e'), 'abcde');
  assert.equal(cleanText('a\r\nb'), 'a\r\nb');
});
