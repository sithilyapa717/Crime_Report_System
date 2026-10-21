// Convicts list, වැරදිකරුවන්ගේ ලේඛනය (REWRITE_PLAN §1.6). Columns in the order of the old monthly
// report (§97): CR, name, NIC, offence, quantity, fine, address, court, case, date convicted, then
// one tick column per sentence type. Landscape A4; the header row repeats on every page.
import type { ConvictRow } from '../../shared/contract/src/index.ts';
import type { OutcomeType } from '../../shared/schemas/src/case.ts';
import { formatDate, formatMoney } from '../mapping/format.ts';
import { esc, page, PAGE_FOOTER, tick, type PrintLayout } from './page.ts';
import type { WordCell, WordDoc } from './word.ts';
import { CONVICTS_LIST as W, MONTHS } from './wording.ts';

export interface ConvictsListPeriod {
  year: number;
  /** 1–12 for the monthly list; omitted for a whole year or another range. */
  month?: number;
  /** Station / unit name, printed above the table. */
  officeName?: string;
}

const SENTENCES: [OutcomeType, string][] = [
  ['community_service', W.communityService],
  ['settlement', W.settlement],
  ['probation', W.probation],
  ['rehabilitation', W.rehabilitation],
  ['government_fee', W.governmentFee],
  ['imprisonment', W.imprisonment],
  ['admonished', W.admonished],
  ['suspended_sentence', W.suspended],
];

const CSS = `
h1 { font-size: 13pt; text-align: center; margin: 0 0 2mm; }
.office { text-align: center; margin-bottom: 4mm; }
table { font-size: 8.5pt; }
th, td { border: 1px solid #000; padding: 1.2mm 1.4mm; vertical-align: top; }
th { background: #eee; font-weight: bold; }
/* vertical captions: tall enough for the longest one (අවවාදකොට මුදා හැරීම) so nothing spills out */
th.s { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; height: 48mm; padding: 1mm 0.5mm; font-size: 8pt; overflow: hidden; }
td.s { text-align: center; width: 6mm; }
td.num { text-align: right; white-space: nowrap; }
td.nw { white-space: nowrap; }
.empty { text-align: center; padding: 8mm; }
`;

export function convictsListTitle(period: ConvictsListPeriod): string {
  if (period.month) {
    const month = MONTHS[period.month - 1];
    if (!month) throw new Error(`month must be 1-12: ${period.month}`);
    return `${period.year} ${W.yearSuffix} ${month} ${W.monthSuffix}`;
  }
  return `${W.registerTitle} – ${period.year}`;
}

export function renderConvictsList(rows: ConvictRow[], period: ConvictsListPeriod): PrintLayout {
  const title = convictsListTitle(period);
  const head = [
    W.crNumber,
    W.name,
    W.nic,
    W.offence,
    W.quantity,
    W.fine,
    W.address,
    W.court,
    W.caseNumber,
    W.convictedDate,
  ]
    .map((h) => `<th>${esc(h)}</th>`)
    .join('');
  const sentenceHead = SENTENCES.map(([, h]) => `<th class="s">${esc(h)}</th>`).join('');
  const body = rows.length
    ? rows
        .map(
          (r) => `<tr>
<td class="nw">${esc(r.crNumber)}</td><td>${esc(r.accusedName)}</td><td class="nw">${esc(r.accusedNic)}</td>
<td class="nw">${esc(r.offenceCode)}</td><td class="num">${esc(r.quantity)}</td>
<td class="num">${esc(r.fineAmount === null ? '' : formatMoney(r.fineAmount))}</td>
<td>${esc(r.accusedAddress)}</td><td>${esc(r.courtName)}</td><td class="nw">${esc(r.caseNumber)}</td>
<td class="nw">${esc(r.convictedDate ? formatDate(r.convictedDate) : '')}</td>
${SENTENCES.map(([o]) => `<td class="s">${r.outcomes.includes(o) ? tick(true) : ''}</td>`).join('')}
</tr>`,
        )
        .join('\n')
    : `<tr><td class="empty" colspan="${10 + SENTENCES.length}">–</td></tr>`;

  const headers = [
    W.crNumber,
    W.name,
    W.nic,
    W.offence,
    W.quantity,
    W.fine,
    W.address,
    W.court,
    W.caseNumber,
    W.convictedDate,
  ];
  const word: WordDoc = {
    landscape: true,
    blocks: [
      { kind: 'para', text: title, align: 'center', bold: true, size: 13, after: 4 },
      ...(period.officeName
        ? [{ kind: 'para', text: period.officeName, align: 'center', after: 8 } as const]
        : []),
      rows.length
        ? {
            kind: 'table',
            headerHeight: 48,
            header: [
              ...headers.map((text): WordCell => ({ text, align: 'center' })),
              ...SENTENCES.map(([, text]): WordCell => ({ text, vertical: true })),
            ],
            rows: rows.map((r): WordCell[] => [
              { text: r.crNumber },
              { text: r.accusedName },
              { text: r.accusedNic ?? '' },
              { text: r.offenceCode },
              { text: String(r.quantity ?? ''), align: 'right' },
              { text: r.fineAmount === null ? '' : formatMoney(r.fineAmount), align: 'right' },
              { text: r.accusedAddress ?? '' },
              { text: r.courtName ?? '' },
              { text: r.caseNumber ?? '' },
              { text: r.convictedDate ? formatDate(r.convictedDate) : '' },
              ...SENTENCES.map(([o]): WordCell => ({
                text: r.outcomes.includes(o) ? tick(true) : '',
                align: 'center',
              })),
            ]),
          }
        : { kind: 'para', text: '–', align: 'center' },
    ],
  };

  return {
    word,
    html: page({
      title,
      landscape: true,
      css: CSS,
      body: `<h1>${esc(title)}</h1>
${period.officeName ? `<div class="office">${esc(period.officeName)}</div>` : ''}
<table><thead><tr>${head}${sentenceHead}</tr></thead>
<tbody>
${body}
</tbody></table>`,
    }),
    landscape: true,
    footerTemplate: PAGE_FOOTER,
  };
}
