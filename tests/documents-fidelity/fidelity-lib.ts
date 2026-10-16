// Fidelity helpers, written independently of the engine on purpose: the tests must not
// judge the engine's output with the engine's own field-handling code.
// Only the ZIP reader and the field-name mapping are shared (both have their own unit tests).
import { createHash } from 'node:crypto';
import { DocxZip } from '../../packages/documents/engine/zip.ts';

export const CONTENT_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

const TOKENS =
  /<w:fldSimple\b[^>]*?\bw:instr="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/w:fldSimple>)|<w:fldChar\b[^>]*\bw:fldCharType="(begin|separate|end)"[^>]*\/>|<w:instrText\b[^>]*>([^<]*)<\/w:instrText>|<w:t\b[^>]*>([^<]*)<\/w:t>|<w:t\b[^>]*\/>|<w:tab\/>|<w:br\b[^>]*\/>|<\/w:p>|<w:p\b[^>]*\/>/g;

/**
 * Text of one XML part as a reader sees it, with every MERGEFIELD replaced by `field(name)`.
 * The text of other fields' results is kept (the engine leaves those fields alone).
 * `field` returning '' gives the fixed text only: the wording that must never change.
 */
export function textWithFields(xml: string, field: (name: string) => string): string {
  let out = '';
  // per open complex field: instruction so far, whether "separate" was seen, and whether it is a merge field
  const stack: { instr: string; inResult: boolean }[] = [];
  const isMerge = (instr: string) => /^\s*MERGEFIELD\b/i.test(instr);
  const nameOf = (instr: string) => /^\s*MERGEFIELD\s+(?:"([^"]+)"|(\S+))/i.exec(instr)?.slice(1).find(Boolean) ?? '';
  const hidden = () => stack.some((f) => !f.inResult || isMerge(f.instr));

  for (const m of xml.matchAll(TOKENS)) {
    const [whole, simpleInstr, , fldChar, instrText, text] = m;
    if (simpleInstr !== undefined) {
      if (hidden()) continue;
      const instr = decode(simpleInstr);
      if (isMerge(instr)) out += field(nameOf(instr));
      else out += textWithFields(m[2] ?? '', field);
    } else if (fldChar === 'begin') {
      stack.push({ instr: '', inResult: false });
    } else if (fldChar === 'separate') {
      const top = stack[stack.length - 1];
      if (top) top.inResult = true;
    } else if (fldChar === 'end') {
      const f = stack.pop();
      if (f && isMerge(f.instr) && !hidden()) out += field(nameOf(f.instr));
    } else if (instrText !== undefined) {
      const top = stack[stack.length - 1];
      if (top && !top.inResult) top.instr += decode(instrText);
    } else if (hidden()) {
      continue;
    } else if (text !== undefined) {
      out += decode(text);
    } else if (whole === '<w:tab/>') {
      out += '\t';
    } else if (whole.startsWith('<w:br')) {
      out += '\n';
    } else if (whole === '</w:p>' || whole.startsWith('<w:p')) {
      // an empty paragraph may be written <w:p/> (Word does this when it saves)
      out += '\n';
    }
  }
  return out;
}

/** Plain text of a filled document part (no fields expected). */
export function plainText(xml: string): string {
  return textWithFields(xml, () => '');
}

/** Fixed text of a whole template: every content part, fields removed, in a stable order. */
export function fixedText(zip: DocxZip): string {
  return zip
    .names()
    .filter((n) => CONTENT_PART.test(n))
    .sort()
    .map((n) => `## ${n}\n${textWithFields(zip.getText(n) ?? '', () => '')}`)
    .join('\n');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Well-formedness check without a parser: every start tag is closed in order.
 * Returns null when well-formed, otherwise a short description of the first problem.
 */
export function xmlProblem(xml: string): string | null {
  const stack: string[] = [];
  const body = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)\b[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (!closing) {
      stack.push(name!);
      continue;
    }
    const open = stack.pop();
    if (open !== name) return `</${name}> at ${m.index} closes <${open ?? 'nothing'}>`;
  }
  if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(body)) return 'bare & in text';
  return null;
}
