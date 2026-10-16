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

/**
 * Characters XML 1.0 does not allow (control characters other than tab / LF / CR, lone surrogates,
 * U+FFFE / U+FFFF). One of them in document.xml makes Word refuse to open the file. Access data
 * pasted from Word often contains U+000B (Word's manual line break) and U+000C (page break).
 */
export function cleanText(value: string): string {
  let out = '';
  for (const ch of value.replace(/[\u000B\u000C]/g, '\n')) {
    const c = ch.codePointAt(0) ?? 0;
    const allowed =
      c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || c >= 0x10000;
    if (allowed) out += ch;
  }
  return out;
}

/** Run content for a value: <w:t> pieces with <w:br/> for line breaks and <w:tab/> for tabs. */
export function valueToRunContent(value: string): string {
  if (value === '') return '';
  return cleanText(value)
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
