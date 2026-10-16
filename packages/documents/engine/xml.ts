// Small XML text helpers. The engine edits WordprocessingML as text on purpose:
// re-serialising through a DOM would change bytes outside the merge fields.

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

export function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Run content for a value: <w:t> pieces with <w:br/> for line breaks and <w:tab/> for tabs. */
export function valueToRunContent(value: string): string {
  if (value === '') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .split('\t')
        .map((piece) => (piece === '' ? '' : `<w:t xml:space="preserve">${escapeXmlText(piece)}</w:t>`))
        .join('<w:tab/>'),
    )
    .join('<w:br/>');
}

/** All visible text of a WordprocessingML fragment (w:t, tabs, breaks, paragraph ends). */
export function visibleText(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<\/w:p>/g)) {
    if (m[1] !== undefined) out += decodeXmlEntities(m[1]);
    else if (m[0] === '<w:tab/>') out += '\t';
    else out += '\n';
  }
  return out;
}
