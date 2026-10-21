// Printable HTML pages (D9). Electron prints them with webContents.printToPDF / print(), which is
// Chromium, so the CSS here targets Chromium's print engine. Fonts: the Sinhala fonts the app ships
// (Noto Sans Sinhala, C1) first, then the ones office PCs already have.

import type { WordDoc } from './word.ts';

export interface PrintLayout {
  /** Complete HTML document. */
  html: string;
  landscape: boolean;
  /**
   * Footer for Electron's printToPDF({ displayHeaderFooter: true, footerTemplate }).
   * Chromium fills the pageNumber / totalPages spans.
   */
  footerTemplate: string;
  /** The same content for Word (buildDocx), so staff can edit it before printing. */
  word: WordDoc;
}

export const FONT_STACK = '"Noto Sans Sinhala", "Iskoola Pota", "Nirmala UI", sans-serif';

export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Ticked / empty box, as the old reports showed check boxes. */
export const tick = (on: boolean) => (on ? '☑' : '☐');

/** "Page X of Y", as the old Access reports printed it (§101). */
export const PAGE_FOOTER = `<div style="font-size:9px;width:100%;text-align:center;font-family:${esc(FONT_STACK)}">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`;

export function page(opts: { title: string; landscape: boolean; css: string; body: string }): string {
  return `<!doctype html>
<html lang="si"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
@page { size: A4 ${opts.landscape ? 'landscape' : 'portrait'}; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; color: #000; background: #fff; font-family: ${FONT_STACK}; font-size: 11pt; }
table { border-collapse: collapse; width: 100%; }
thead { display: table-header-group; } /* repeat the header row on every page */
tr { page-break-inside: avoid; break-inside: avoid; }
${opts.css}
</style></head>
<body>
${opts.body}
</body></html>
`;
}
