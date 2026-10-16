// Minimal read-only .docx (ZIP) reader for the inventory tooling.
// The generation engine uses pizzip; this only exists so scripts run with no npm install.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/** Returns every entry of the ZIP as name → UTF-8 text (XML parts) or Buffer. */
export function readZipEntries(file: string): Map<string, Buffer> {
  const buf = readFileSync(file);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a ZIP file (no end-of-central-directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    if (method === 0) entries.set(name, Buffer.from(raw));
    else if (method === 8) entries.set(name, inflateRawSync(raw));
    else throw new Error(`unsupported compression method ${method} in ${name}`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

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

/**
 * Field instructions in one XML part, in document order: both <w:fldSimple w:instr>
 * and complex fields (fldChar begin … instrText … separate/end), including nested ones.
 */
export function fieldInstructions(xml: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  const re =
    /<w:fldSimple\b[^>]*\bw:instr="([^"]*)"|<w:fldChar\b[^>]*\bw:fldCharType="(begin|separate|end)"|<w:instrText\b[^>]*>([^<]*)<\/w:instrText>/g;
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) out.push(decodeXmlEntities(m[1]).trim());
    else if (m[2] === 'begin') stack.push('');
    else if (m[2] === 'separate' || m[2] === 'end') {
      // the instruction is complete at "separate" (or at "end" when there is no result)
      const top = stack[stack.length - 1];
      if (top !== undefined && top !== '\u0000') {
        out.push(top.trim());
        stack[stack.length - 1] = '\u0000';
      }
      if (m[2] === 'end') stack.pop();
    } else if (m[3] !== undefined && stack.length && stack[stack.length - 1] !== '\u0000') {
      stack[stack.length - 1] += decodeXmlEntities(m[3]);
    }
  }
  return out;
}

/** MERGEFIELD name from an instruction, e.g. `MERGEFIELD "Name_of_Accused" \* MERGEFORMAT`. */
export function mergeFieldName(instr: string): string | null {
  const m = /^MERGEFIELD\s+(?:"([^"]+)"|(\S+))/i.exec(instr);
  return m ? (m[1] ?? m[2] ?? null) : null;
}
