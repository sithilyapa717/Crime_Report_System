// ZIP container for .docx files.
//
// Entries that are not changed are written back with their original compressed bytes,
// so every part the engine does not touch stays byte-identical to the template.
// No npm dependency: zlib's raw deflate/inflate and crc32 cover everything a .docx needs.
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  /** General-purpose flags from the central directory (bit 11 = UTF-8 name). */
  flags: number;
  method: number; // 0 stored, 8 deflate
  dosTime: number;
  dosDate: number;
  crc: number;
  compressed: Buffer;
  uncompressedSize: number;
  /** Set when the entry was replaced; written deflated on save. */
  replaced?: Buffer;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

export class DocxZip {
  readonly entries: ZipEntry[];

  private constructor(entries: ZipEntry[]) {
    this.entries = entries;
  }

  static read(buf: Buffer): DocxZip {
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error('not a ZIP file (no end-of-central-directory record)');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries: ZipEntry[] = [];
    for (let i = 0; i < count; i++) {
      if (buf.readUInt32LE(p) !== SIG_CENTRAL) throw new Error('bad central directory entry');
      const flags = buf.readUInt16LE(p + 8);
      const method = buf.readUInt16LE(p + 10);
      const dosTime = buf.readUInt16LE(p + 12);
      const dosDate = buf.readUInt16LE(p + 14);
      const crc = buf.readUInt32LE(p + 16);
      const compSize = buf.readUInt32LE(p + 20);
      const uncompressedSize = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localOffset = buf.readUInt32LE(p + 42);
      const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
      if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) throw new Error(`bad local header for ${name}`);
      const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
      if (method !== 0 && method !== 8) throw new Error(`unsupported compression method ${method} in ${name}`);
      entries.push({
        name,
        flags,
        method,
        dosTime,
        dosDate,
        crc,
        compressed: Buffer.from(buf.subarray(start, start + compSize)),
        uncompressedSize,
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return new DocxZip(entries);
  }

  /** A new archive holding these UTF-8 text parts (a .docx built from scratch). */
  static create(files: Record<string, string>, now: Date = new Date()): DocxZip {
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    return new DocxZip(
      Object.entries(files).map(([name, text]) => ({
        name,
        flags: 0x0800, // UTF-8 names
        method: 8,
        dosTime,
        dosDate,
        crc: 0,
        compressed: Buffer.alloc(0),
        uncompressedSize: 0,
        replaced: Buffer.from(text, 'utf8'),
      })),
    );
  }

  names(): string[] {
    return this.entries.map((e) => e.name);
  }

  has(name: string): boolean {
    return this.entries.some((e) => e.name === name);
  }

  get(name: string): Buffer | undefined {
    const e = this.entries.find((x) => x.name === name);
    if (!e) return undefined;
    if (e.replaced) return e.replaced;
    return e.method === 0 ? e.compressed : inflateRawSync(e.compressed);
  }

  getText(name: string): string | undefined {
    return this.get(name)?.toString('utf8');
  }

  /** Replace an existing entry's content. Unchanged content is ignored, so the bytes stay original. */
  setText(name: string, text: string): void {
    const e = this.entries.find((x) => x.name === name);
    if (!e) throw new Error(`no entry ${name}`);
    const data = Buffer.from(text, 'utf8');
    if (this.get(name)?.equals(data)) return;
    e.replaced = data;
  }

  write(): Buffer {
    const chunks: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const e of this.entries) {
      let { method, crc, compressed, uncompressedSize } = e;
      if (e.replaced) {
        method = 8;
        crc = crc32(e.replaced);
        compressed = deflateRawSync(e.replaced);
        uncompressedSize = e.replaced.length;
      }
      // bit 3 (data descriptor) is cleared: sizes and CRC are always in the headers we write
      const flags = e.flags & ~0x0008;
      const name = Buffer.from(e.name, 'utf8');

      const local = Buffer.alloc(30);
      local.writeUInt32LE(SIG_LOCAL, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(flags, 6);
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(e.dosTime, 10);
      local.writeUInt16LE(e.dosDate, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(uncompressedSize, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      chunks.push(local, name, compressed);

      const cen = Buffer.alloc(46);
      cen.writeUInt32LE(SIG_CENTRAL, 0);
      cen.writeUInt16LE(20, 4);
      cen.writeUInt16LE(20, 6);
      cen.writeUInt16LE(flags, 8);
      cen.writeUInt16LE(method, 10);
      cen.writeUInt16LE(e.dosTime, 12);
      cen.writeUInt16LE(e.dosDate, 14);
      cen.writeUInt32LE(crc, 16);
      cen.writeUInt32LE(compressed.length, 20);
      cen.writeUInt32LE(uncompressedSize, 24);
      cen.writeUInt16LE(name.length, 28);
      cen.writeUInt32LE(offset, 42);
      central.push(cen, name);

      offset += local.length + name.length + compressed.length;
    }
    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_END, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...chunks, centralBuf, end]);
  }
}
