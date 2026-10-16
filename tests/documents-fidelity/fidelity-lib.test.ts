// Self-test of the independent XML reader the fidelity tests rely on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainText, textWithFields, xmlProblem } from './fidelity-lib.ts';

const r = (inner: string) => `<w:r>${inner}</w:r>`;
const fld = (instr: string, result: string) =>
  r('<w:fldChar w:fldCharType="begin"/>') +
  r(`<w:instrText>${instr}</w:instrText>`) +
  r('<w:fldChar w:fldCharType="separate"/>') +
  r(`<w:t>${result}</w:t>`) +
  r('<w:fldChar w:fldCharType="end"/>');

test('fields are replaced in place; other fields keep their result; codes never show', () => {
  const xml = `<w:p>${r('<w:t>a </w:t>')}${fld(' MERGEFIELD X ', 'old')}${r('<w:t> b </w:t>')}${fld(' PAGE ', '3')}</w:p>`;
  assert.equal(textWithFields(xml, (n) => `[${n}]`), 'a [X] b 3\n');
  assert.equal(plainText(xml), 'a  b 3\n');
});

test('simple fields, tabs, breaks, empty paragraphs in both spellings, entities', () => {
  const xml =
    `<w:p><w:fldSimple w:instr=" MERGEFIELD Y "><w:r><w:t>old</w:t></w:r></w:fldSimple>${r('<w:tab/><w:t>&amp;&lt;</w:t><w:br/>')}</w:p>` +
    '<w:p/><w:p w:rsidR="1"/><w:p></w:p>';
  assert.equal(textWithFields(xml, (n) => n), 'Y\t&<\n\n\n\n\n');
});

test('xmlProblem finds unclosed, crossed and unescaped markup', () => {
  assert.equal(xmlProblem('<?xml version="1.0"?><a><b/><c>x</c></a>'), null);
  assert.match(xmlProblem('<a><b></a>') ?? '', /closes <b>/);
  assert.match(xmlProblem('<a><b>') ?? '', /unclosed/);
  assert.match(xmlProblem('<a>x & y</a>') ?? '', /bare &/);
  assert.equal(xmlProblem('<a>x &amp; &#3482; &#x0DA0;</a>'), null);
});
