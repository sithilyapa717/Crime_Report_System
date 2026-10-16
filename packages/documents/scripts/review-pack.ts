// Staff review pack (D1 / Phase 5): every registered template filled with the made-up sample CR,
// optional PDFs (Windows + Word), a review sheet to fill in Excel, and a printable index.
// Staff return review-sheet.csv; apply it with apply-review.ts.
//
// Usage: node packages/documents/scripts/review-pack.ts <out dir> [--pdf]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fillTemplate } from '../engine/fill.ts';
import { SAMPLE_CR } from '../mapping/sample-data.ts';
import { JsonTemplateSource, type TemplateEntry, type TemplateFamily } from '../registry/registry.ts';
import { reviewSheetCsv, type ReviewRowInput } from '../registry/review.ts';
import { ORIGINALS_DIR } from './originals-lib.ts';

const args = process.argv.slice(2);
const outArg = args.find((a) => !a.startsWith('--'));
if (!outArg) {
  console.error('Usage: node review-pack.ts <out dir> [--pdf]');
  process.exit(2);
}
const out = resolve(outArg);
const withPdf = args.includes('--pdf');

const FAMILY_ORDER: TemplateFamily[] = [
  'plaint',
  'charge-sheet',
  'reward-voucher',
  'motion-sheet',
  'warrant-extension',
  'previous-record',
  'production',
  'other',
];
const FAMILY_TITLES: Record<TemplateFamily, string> = {
  plaint: 'Plaints by offence – පැමිණිලි',
  'charge-sheet': 'Charge sheets – චෝදනා පත්‍ර',
  'reward-voucher': 'Reward and fine vouchers – REWARDS',
  'motion-sheet': 'Motion sheets – මෝෂන් කොළ',
  'warrant-extension': 'Warrant extension – වරෙන්තු දිර්ග කිරීම',
  'previous-record': 'Previous-record notes – පෙර වැරදි',
  production: 'Productions – සාක්ෂි භාණ්ඩ',
  other: 'Other',
};

/** Questions that are not about one template (docs/engine-notes/MEMBER_D_PHASES.md). */
const GENERAL_QUESTIONS = [
  'Quantity1: what does it hold? In "usfl new බෝතලය" it is printed right next to Quantity (180 and 750 print as "180750").',
  'Cash_Number / Cash_Number_1: note serial numbers, or the number of notes?',
  'How should money look in documents: 25000, 25,000 or 25,000.00?',
  'How should times look: 14.45 or 14:45?',
  'Cigarette and beedi templates (GOLD LEAF folder): which offence code is each one for?',
  'Which Sinhala fonts must be installed on office PCs (Iskoola Pota, FMAbhaya, DL-Manel …)?',
];

const variantText = (e: TemplateEntry) =>
  [
    e.variant.container,
    e.variant.sample === true ? 'sample' : e.variant.sample === false ? 'no sample' : '',
    e.variant.volumeMl ? `${e.variant.volumeMl} ml` : '',
    e.variant.noteRs ? `Rs ${e.variant.noteRs}` : '',
    e.variant.offences ? `${e.variant.offences} offences` : '',
  ]
    .filter(Boolean)
    .join(', ');

const entries = (await new JsonTemplateSource().list()).sort(
  (a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.id.localeCompare(b.id),
);

const rows: ReviewRowInput[] = [];
const pdfJobs: { docx: string; pdf: string }[] = [];
for (const entry of entries) {
  const { docx, report } = fillTemplate(readFileSync(join(ORIGINALS_DIR, entry.id)), SAMPLE_CR);
  const docxPath = join(out, 'templates', entry.id);
  mkdirSync(dirname(docxPath), { recursive: true });
  writeFileSync(docxPath, docx);
  const pdfPath = docxPath.replace(/\.docx$/i, '.pdf');
  if (withPdf) pdfJobs.push({ docx: docxPath, pdf: pdfPath });
  rows.push({
    entry,
    variant: variantText(entry),
    emptyFields: report.missing,
    samplePdf: `templates/${entry.id.replace(/\.docx$/i, withPdf ? '.pdf' : '.docx')}`,
  });
}

if (withPdf) {
  const list = join(out, 'pdf-jobs.json');
  writeFileSync(list, JSON.stringify(pdfJobs), 'utf8');
  console.log(`Word is converting ${pdfJobs.length} documents to PDF…`);
  const ps = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(import.meta.dirname, 'pdf-batch.ps1'), list],
    { encoding: 'utf8', timeout: 60 * 60 * 1000 },
  );
  rmSync(list, { force: true });
  const failed = (ps.stdout ?? '').split(/\r?\n/).filter((l) => l.startsWith('FAIL'));
  if (ps.status !== 0 || failed.length) console.error(failed.join('\n') || ps.stderr);
}

writeFileSync(join(out, 'review-sheet.csv'), reviewSheetCsv(rows), 'utf8');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let html = `<!doctype html>
<html lang="si"><head><meta charset="utf-8"><title>Template review</title>
<style>
body{font-family:"Iskoola Pota","Nirmala UI",sans-serif;margin:24px;color:#111}
h1{font-size:20px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #999}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #bbb;padding:4px 6px;vertical-align:top}
th{background:#eee;text-align:left}td.n{width:2em;text-align:right}.q{color:#8a4b00}
@media print{a{color:inherit;text-decoration:none}}
</style></head><body>
<h1>Court document templates – staff review</h1>
<p>Every template below was filled with a <b>made-up</b> sample case (CR 12/2026, Negombo) so you can see how it prints.
Nothing in the original Word files was changed.</p>
<ol>
<li>Open each sample and check it is the version your office uses today.</li>
<li>In <b>review-sheet.csv</b> (open with Excel), in the column <b>Decision</b>, write <b>current</b> for the version in use,
or <b>old copy</b> for versions no longer used. Leave it empty if unsure.</li>
<li>If the offence code is wrong or missing, write the right code(s) in <b>Correct offence codes</b> (for example <code>PUDS</code>
or <code>SUDS PUDS</code>).</li>
<li>Answer the questions below and in the <b>Questions</b> column, in <b>Comments</b>.</li>
<li>Save as <b>CSV UTF-8</b> (Excel: File → Save As → "CSV UTF-8") and send it back.</li>
</ol>
<h2>General questions</h2><ol>${GENERAL_QUESTIONS.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
`;
let n = 0;
for (const family of FAMILY_ORDER) {
  const group = rows.filter((r) => r.entry.family === family);
  if (!group.length) continue;
  html += `<h2>${esc(FAMILY_TITLES[family])} (${group.length})</h2>
<table><tr><th>No</th><th>Template</th><th>Offence</th><th>Variant</th><th>Questions</th></tr>`;
  for (const r of group) {
    n++;
    html += `<tr><td class="n">${n}</td><td><a href="${esc(encodeURI(r.samplePdf))}">${esc(r.entry.id)}</a></td><td>${esc(
      r.entry.offenceCodes.join(' ') || (family === 'plaint' || family === 'charge-sheet' ? '? (not set)' : 'any'),
    )}</td><td>${esc(r.variant)}</td><td class="q">${esc(r.entry.notes ?? '')}</td></tr>`;
  }
  html += '</table>\n';
}
html += '</body></html>\n';
writeFileSync(join(out, 'index.html'), html, 'utf8');
console.log(`Review pack: ${rows.length} templates → ${out}`);
