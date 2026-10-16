// Certificate of previous conviction, සුරාබදු ඊ 48 (REWRITE_PLAN §1.6, §1.9 item 10).
// Same fields, order and wording as the old Access report; one certificate per page.
// Input rows come from SearchService.previousOffences / convicts (B6).
import type { ConvictRow } from '../../shared/contract/src/index.ts';
import { formatDate, formatMoney } from '../mapping/format.ts';
import { esc, page, PAGE_FOOTER, tick, type PrintLayout } from './page.ts';
import { E48 } from './wording.ts';

const CSS = `
.cert { page-break-after: always; break-after: page; padding-top: 6mm; }
.cert:last-child { page-break-after: auto; break-after: auto; }
.head { text-align: center; line-height: 1.6; }
.head .dept { font-size: 14pt; font-weight: bold; }
.head .ref { font-size: 9pt; }
h1 { text-align: center; font-size: 13pt; margin: 8mm 0 6mm; text-decoration: underline; }
dl { display: grid; grid-template-columns: 52mm 1fr; row-gap: 4mm; margin: 0 0 10mm; }
dt { font-weight: bold; }
dd { margin: 0; border-bottom: 1px dotted #555; min-height: 6mm; }
.sentence div { margin: 1mm 0; }
.box { display: inline-block; width: 6mm; }
.certify { margin-top: 12mm; }
.sign { margin-top: 18mm; text-align: right; }
.sign span { display: inline-block; width: 60mm; border-top: 1px dotted #000; }
`;

function certificate(r: ConvictRow): string {
  const has = (o: ConvictRow['outcomes'][number]) => r.outcomes.includes(o);
  const line = (on: boolean, text: string) => `<div><span class="box">${tick(on)}</span>${esc(text)}</div>`;
  const fine = r.fineAmount === null ? '' : formatMoney(r.fineAmount);
  return `<section class="cert">
<div class="head"><div class="dept">${esc(E48.department)}</div><div>${esc(E48.formNumber)}</div><div class="ref">${esc(E48.reference)}</div></div>
<h1>${esc(E48.title)}</h1>
<dl>
<dt>${esc(E48.name)}</dt><dd>${esc(r.accusedName)}</dd>
<dt>${esc(E48.address)}</dt><dd>${esc(r.accusedAddress)}</dd>
<dt>${esc(E48.nic)}</dt><dd>${esc(r.accusedNic)}</dd>
<dt>${esc(E48.court)}</dt><dd>${esc(r.courtName)}</dd>
<dt>${esc(E48.convictedDate)}</dt><dd>${esc(r.convictedDate ? formatDate(r.convictedDate) : '')}</dd>
<dt>${esc(E48.caseNumber)}</dt><dd>${esc(r.caseNumber)}</dd>
<dt>${esc(E48.offence)}</dt><dd>${esc(r.offenceName || r.offenceCode)}</dd>
<dt>${esc(E48.sentence)}</dt><dd class="sentence">
<div>${esc(E48.fine)} ${esc(fine)}</div>
${line(has('community_service'), E48.communityService)}
${line(has('admonished'), E48.admonished)}
${line(has('probation'), E48.probation)}
${line(has('rehabilitation'), E48.rehabilitation)}
${line(has('imprisonment'), E48.imprisonment)}
</dd>
</dl>
<p class="certify">${esc(E48.certify)}</p>
<div class="sign"><span></span></div>
</section>`;
}

/** One ඊ 48 certificate per conviction row. */
export function renderCertificateE48(rows: ConvictRow[]): PrintLayout {
  if (!rows.length) throw new Error('no conviction to certify');
  return {
    html: page({ title: E48.title, landscape: false, css: CSS, body: rows.map(certificate).join('\n') }),
    landscape: false,
    footerTemplate: PAGE_FOOTER,
  };
}
