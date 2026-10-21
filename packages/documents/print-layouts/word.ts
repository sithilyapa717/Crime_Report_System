// A small Word (.docx) writer for the fixed print layouts (certificate E 48, convicts list,
// registers). The same data that fills the printable HTML is described as a `WordDoc`; this file
// turns it into a real .docx that staff open in Word, change to their needs and print there.
//
// Only what those layouts need: centred / right-aligned paragraphs, bordered tables with a repeated
// header row and a total row, a two-column "label … value" block, vertical column captions, page
// breaks and a "Page X of Y" footer. Sinhala runs use the complex-script font and size slots.
import { DocxZip } from '../engine/zip.ts';

export type WordAlign = 'left' | 'center' | 'right';

export interface WordCell {
  text: string;
  align?: WordAlign;
  bold?: boolean;
  /** Caption written bottom-to-top (the tick columns of the convicts list). */
  vertical?: boolean;
  /** Columns this cell covers; default 1. */
  span?: number;
}

export type WordBlock =
  | {
      kind: 'para';
      text: string;
      align?: WordAlign;
      bold?: boolean;
      underline?: boolean;
      /** Points; default 11. */
      size?: number;
      /** Points of space before / after; default 0 / 6. */
      before?: number;
      after?: number;
      pageBreakBefore?: boolean;
    }
  | {
      /** Bordered table: `header` repeats on every page, `footer` (a total row) prints once at the end. */
      kind: 'table';
      header: WordCell[];
      rows: WordCell[][];
      footer?: WordCell[];
      /** Points; default 8.5. */
      size?: number;
      /** Height of the header row in millimetres, for vertical captions. */
      headerHeight?: number;
    }
  | {
      /** "Label … value" lines without borders; a value with several lines prints one per line. */
      kind: 'fields';
      rows: { label: string; value: string | string[] }[];
      /** Width of the label column in millimetres. */
      labelWidth: number;
    };

export interface WordDoc {
  landscape: boolean;
  blocks: WordBlock[];
}

const FONT = 'Iskoola Pota';
const MM = 56.6929; // twips per millimetre
const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** XML-safe text: control characters dropped, markup characters escaped. */
function xmlText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const half = (pt: number) => Math.round(pt * 2);

function run(text: string, opts: { size: number; bold?: boolean; underline?: boolean }): string {
  const sz = half(opts.size);
  const rPr =
    `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/>` +
    (opts.bold ? '<w:b/><w:bCs/>' : '') +
    (opts.underline ? '<w:u w:val="single"/>' : '') +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

function paragraph(
  text: string,
  o: {
    size: number;
    align?: WordAlign;
    bold?: boolean;
    underline?: boolean;
    before?: number;
    after?: number;
    pageBreakBefore?: boolean;
  },
): string {
  const jc = o.align && o.align !== 'left' ? `<w:jc w:val="${o.align}"/>` : '';
  const pPr =
    (o.pageBreakBefore ? '<w:pageBreakBefore/>' : '') +
    `<w:spacing w:before="${Math.round((o.before ?? 0) * 20)}" w:after="${Math.round((o.after ?? 6) * 20)}"/>` +
    jc;
  const runs = text === '' ? '' : run(text, o);
  return `<w:p><w:pPr>${pPr}</w:pPr>${runs}</w:p>`;
}

function cellXml(c: WordCell, size: number, header: boolean, borders: boolean): string {
  const tcPr =
    (c.span && c.span > 1 ? `<w:gridSpan w:val="${c.span}"/>` : '') +
    (c.vertical ? '<w:textDirection w:val="btLr"/>' : '') +
    (header ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : '') +
    (borders
      ? ''
      : '<w:tcBorders><w:bottom w:val="dotted" w:sz="4" w:space="0" w:color="555555"/></w:tcBorders>') +
    (c.vertical ? '<w:vAlign w:val="center"/>' : '');
  const p = paragraph(c.text, {
    size,
    bold: c.bold ?? header,
    align: c.vertical ? 'left' : c.align,
    after: 0,
  });
  return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${p}</w:tc>`;
}

function rowXml(cells: WordCell[], size: number, o: { header?: boolean; height?: number }): string {
  const trPr =
    '<w:cantSplit/>' +
    (o.height ? `<w:trHeight w:val="${Math.round(o.height * MM)}" w:hRule="atLeast"/>` : '') +
    (o.header ? '<w:tblHeader/>' : '');
  return `<w:tr><w:trPr>${trPr}</w:trPr>${cells.map((c) => cellXml(c, size, !!o.header, true)).join('')}</w:tr>`;
}

function tableXml(b: Extract<WordBlock, { kind: 'table' }>): string {
  const size = b.size ?? 8.5;
  const cols = b.header.reduce((n, c) => n + (c.span ?? 1), 0);
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;
  const grid = Array.from({ length: cols }, () => '<w:gridCol w:w="1000"/>').join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
    `<w:tblLayout w:type="autofit"/>` +
    `<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr><w:tblGrid>${grid}</w:tblGrid>` +
    rowXml(b.header, size, {
      header: true,
      ...(b.headerHeight ? { height: b.headerHeight } : {}),
    }) +
    b.rows.map((r) => rowXml(r, size, {})).join('') +
    (b.footer
      ? rowXml(
          b.footer.map((c) => ({ ...c, bold: true })),
          size,
          {},
        )
      : '') +
    `</w:tbl>` +
    // Word needs a paragraph after a table
    paragraph('', { size: 4, after: 0 })
  );
}

function fieldsXml(b: Extract<WordBlock, { kind: 'fields' }>): string {
  const label = Math.round(b.labelWidth * MM);
  const rows = b.rows
    .map((r) => {
      const lines = Array.isArray(r.value) ? r.value : [r.value];
      const value = lines.map((l) => paragraph(l, { size: 11, after: 2 })).join('');
      return (
        `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
        `<w:tc><w:tcPr><w:tcW w:w="${label}" w:type="dxa"/></w:tcPr>${paragraph(r.label, { size: 11, bold: true, after: 8 })}</w:tc>` +
        `<w:tc><w:tcPr><w:tcBorders><w:bottom w:val="dotted" w:sz="4" w:space="0" w:color="555555"/></w:tcBorders></w:tcPr>${value}</w:tc>` +
        `</w:tr>`
      );
    })
    .join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${label}"/><w:gridCol w:w="6000"/></w:tblGrid>${rows}</w:tbl>` +
    paragraph('', { size: 4, after: 0 })
  );
}

function blockXml(b: WordBlock): string {
  if (b.kind === 'table') return tableXml(b);
  if (b.kind === 'fields') return fieldsXml(b);
  return paragraph(b.text, { ...b, size: b.size ?? 11 });
}

const A4 = { w: 11906, h: 16838 };

function documentXml(doc: WordDoc): string {
  const [w, h] = doc.landscape ? [A4.h, A4.w] : [A4.w, A4.h];
  const sect =
    `<w:sectPr><w:footerReference w:type="default" r:id="rId2"/>` +
    `<w:pgSz w:w="${w}" w:h="${h}"${doc.landscape ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${Math.round(14 * MM)}" w:right="${Math.round(12 * MM)}" w:bottom="${Math.round(16 * MM)}" w:left="${Math.round(12 * MM)}" w:header="${Math.round(8 * MM)}" w:footer="${Math.round(8 * MM)}" w:gutter="0"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${doc.blocks.map(blockXml).join('')}${sect}</w:body></w:document>`;
}

const footerXml = () => {
  const r = (inner: string) =>
    `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>${inner}</w:r>`;
  const field = (code: string) =>
    `<w:fldSimple w:instr=" ${code} ">${r('<w:t>1</w:t>')}</w:fldSimple>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${r('<w:t xml:space="preserve">Page </w:t>')}${field('PAGE')}${r('<w:t xml:space="preserve"> of </w:t>')}${field('NUMPAGES')}</w:p></w:ftr>`;
};

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB" w:bidi="si-LK"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;

/** The finished .docx file contents. */
export function buildDocx(doc: WordDoc): Buffer {
  return DocxZip.create({
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': ROOT_RELS,
    'word/document.xml': documentXml(doc),
    'word/styles.xml': stylesXml,
    'word/footer1.xml': footerXml(),
    'word/_rels/document.xml.rels': DOCUMENT_RELS,
  }).write();
}
