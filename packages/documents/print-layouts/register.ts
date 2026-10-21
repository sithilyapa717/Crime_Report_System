// Printable register for any report result (ReportService.run, B7): the CR registers, warrant /
// trial / summons lists, fines lists and so on. Landscape A4, header row repeated on every page,
// "Page X of Y" footer, fine total under the fine column.
//
// Column captions come from the caller (packages/shared/labels via each column's labelKey), so
// this file holds no wording of its own. Values print in the old formats: dates YYYY.MM.DD,
// money from cents, sentence columns (value 1) as a tick.
import type { ReportResult } from '../../shared/contract/src/index.ts';
import { formatDate, formatMoney } from '../mapping/format.ts';
import { esc, page, PAGE_FOOTER, tick, type PrintLayout } from './page.ts';
import type { WordBlock, WordDoc } from './word.ts';

export interface RegisterOptions {
  /** Title printed above the table (already in Sinhala, from the labels file). */
  title: string;
  /** Lines printed under the title, e.g. office and period. */
  subtitle?: string[];
  /** Caption for a column's labelKey. */
  caption: (labelKey: string) => string;
}

/** Report column keys whose value 1 means "this sentence was given" (convicts report). */
const TICK_KEYS = new Set([
  'communityService',
  'settlement',
  'probation',
  'rehabilitation',
  'governmentFee',
  'imprisonment',
  'admonished',
  'suspendedSentence',
]);

const CSS = `
h1 { font-size: 13pt; text-align: center; margin: 0 0 2mm; }
.sub { text-align: center; margin-bottom: 3mm; }
table { font-size: 8.5pt; }
th, td { border: 1px solid #000; padding: 1.2mm 1.4mm; vertical-align: top; }
th { background: #eee; }
td.num { text-align: right; white-space: nowrap; }
td.c { text-align: center; }
td.nw { white-space: nowrap; }
tfoot td { font-weight: bold; }
tfoot { display: table-row-group; } /* total once, at the end */
`;

/** `text` is plain; the HTML layout escapes it and the Word layout writes it as it is. */
function cell(key: string, value: string | number | null): { text: string; cls: string } {
  if (TICK_KEYS.has(key)) return { text: value ? tick(true) : '', cls: 'c' };
  if (value === null || value === undefined || value === '') return { text: '', cls: '' };
  // a register lists many CRs: one bad value prints as stored rather than stopping the whole printout
  const safe = (format: () => string) => {
    try {
      return format();
    } catch {
      return String(value);
    }
  };
  if (key === 'fineAmount' && typeof value === 'number')
    return { text: safe(() => formatMoney(value)), cls: 'num' };
  if (/Date$/.test(key) && typeof value === 'string')
    return { text: safe(() => formatDate(value)), cls: 'nw' };
  if (typeof value === 'number') return { text: String(value), cls: 'num' };
  return {
    text: value,
    cls: /^(crNumber|accusedNic|caseNumber|offenceCode)$/.test(key) ? 'nw' : '',
  };
}

const ALIGN = { num: 'right', c: 'center' } as const;

export function renderRegister(result: ReportResult, opts: RegisterOptions): PrintLayout {
  const cols = result.columns;
  const head = cols.map((c) => `<th>${esc(opts.caption(c.labelKey))}</th>`).join('');
  const rows = result.rows
    .map(
      (row) =>
        `<tr>${cols
          .map((c) => {
            const v = cell(c.key, row[c.key] ?? null);
            return `<td${v.cls ? ` class="${v.cls}"` : ''}>${esc(v.text)}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('\n');
  const fineIndex = cols.findIndex((c) => c.key === 'fineAmount');
  const total =
    fineIndex >= 0 && result.rows.length
      ? `<tfoot><tr>${cols.map((_, i) => `<td class="num">${i === fineIndex ? esc(formatMoney(result.fineTotal)) : ''}</td>`).join('')}</tr></tfoot>`
      : '';

  const word: WordDoc = {
    landscape: true,
    blocks: [
      { kind: 'para', text: opts.title, align: 'center', bold: true, size: 13, after: 4 },
      ...(opts.subtitle ?? []).map((text): WordBlock => ({
        kind: 'para',
        text,
        align: 'center',
        after: 4,
      })),
      result.rows.length
        ? {
            kind: 'table',
            header: cols.map((c) => ({ text: opts.caption(c.labelKey), align: 'center' })),
            rows: result.rows.map((row) =>
              cols.map((c) => {
                const v = cell(c.key, row[c.key] ?? null);
                return {
                  text: v.text,
                  ...(ALIGN[v.cls as keyof typeof ALIGN]
                    ? { align: ALIGN[v.cls as keyof typeof ALIGN] }
                    : {}),
                };
              }),
            ),
            ...(fineIndex >= 0
              ? {
                  footer: cols.map((_, i) => ({
                    text: i === fineIndex ? formatMoney(result.fineTotal) : '',
                    align: 'right' as const,
                  })),
                }
              : {}),
          }
        : { kind: 'para', text: '–', align: 'center' },
    ],
  };

  return {
    word,
    html: page({
      title: opts.title,
      landscape: true,
      css: CSS,
      body: `<h1>${esc(opts.title)}</h1>
${(opts.subtitle ?? []).map((s) => `<div class="sub">${esc(s)}</div>`).join('\n')}
<table><thead><tr>${head}</tr></thead>
<tbody>
${rows || `<tr><td class="c" colspan="${cols.length}">–</td></tr>`}
</tbody>${total}</table>`,
    }),
    landscape: true,
    footerTemplate: PAGE_FOOTER,
  };
}
