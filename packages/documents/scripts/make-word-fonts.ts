// Makes the Sinhala fonts that "Open in Word" embeds in its .docx files (print-layouts/fonts).
// Word can only embed TrueType, and the app's Noto Sans Sinhala comes from @fontsource as WOFF,
// so the WOFF tables are unpacked into a plain .ttf. Only the Sinhala subset is used: Latin text
// in those documents is set in Times New Roman, which every PC has.
//
// Usage: node packages/documents/scripts/make-word-fonts.ts   (after `pnpm install`)
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';

/** The sfnt (.ttf) inside a WOFF 1.0 file. */
export function woffToTtf(woff: Buffer): Buffer {
  if (woff.readUInt32BE(0) !== 0x774f4646) throw new Error('not a WOFF file');
  const flavor = woff.readUInt32BE(4);
  const count = woff.readUInt16BE(12);
  const tables = Array.from({ length: count }, (_, i) => {
    const at = 44 + i * 20;
    const offset = woff.readUInt32BE(at + 4);
    const compLength = woff.readUInt32BE(at + 8);
    const origLength = woff.readUInt32BE(at + 12);
    const raw = woff.subarray(offset, offset + compLength);
    return {
      tag: woff.subarray(at, at + 4),
      checksum: woff.readUInt32BE(at + 16),
      data: compLength < origLength ? inflateSync(raw) : Buffer.from(raw),
    };
  });
  const pad = (n: number) => (n + 3) & ~3;
  const head = Buffer.alloc(12 + count * 16);
  const searchRange = 2 ** Math.floor(Math.log2(count)) * 16;
  head.writeUInt32BE(flavor, 0);
  head.writeUInt16BE(count, 4);
  head.writeUInt16BE(searchRange, 6);
  head.writeUInt16BE(Math.floor(Math.log2(count)), 8);
  head.writeUInt16BE(count * 16 - searchRange, 10);
  let offset = head.length;
  const bodies: Buffer[] = [];
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    t.tag.copy(head, at);
    head.writeUInt32BE(t.checksum, at + 4);
    head.writeUInt32BE(offset, at + 8);
    head.writeUInt32BE(t.data.length, at + 12);
    const padded = Buffer.alloc(pad(t.data.length));
    t.data.copy(padded);
    bodies.push(padded);
    offset += padded.length;
  });
  return Buffer.concat([head, ...bodies]);
}

if (import.meta.main) {
  const require = createRequire(
    join(import.meta.dirname, '../../../apps/desktop/renderer/package.json'),
  );
  const pkg = dirname(require.resolve('@fontsource/noto-sans-sinhala/package.json'));
  const out = join(import.meta.dirname, '..', 'print-layouts', 'fonts');
  mkdirSync(out, { recursive: true });
  for (const [weight, name] of [
    [400, 'Regular'],
    [700, 'Bold'],
  ] as const) {
    const ttf = woffToTtf(
      readFileSync(join(pkg, 'files', `noto-sans-sinhala-sinhala-${weight}-normal.woff`)),
    );
    writeFileSync(join(out, `NotoSansSinhala-${name}.ttf`), ttf);
    console.log(`NotoSansSinhala-${name}.ttf  ${ttf.length} bytes`);
  }
  const license = readdirSync(pkg).find((f) => /^licen[cs]e/i.test(f));
  if (license) copyFileSync(join(pkg, license), join(out, 'OFL.txt'));
}
