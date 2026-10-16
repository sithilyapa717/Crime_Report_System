import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { DocxZip } from './zip.ts';

interface RawEntry {
  name: string;
  data: string;
  method: 0 | 8;
  /** Set bit 3 (data descriptor): sizes and CRC are 0 in the local header, as some writers do. */
  descriptor?: boolean;
}

/** A minimal ZIP built byte by byte, independent of DocxZip.write. */
function buildZip(entries: RawEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.from(e.data, 'utf8');
    const comp = e.method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, 'utf8');
    const flags = 0x0800 | (e.descriptor ? 0x0008 : 0);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt32LE(e.descriptor ? 0 : crc, 14);
    local.writeUInt32LE(e.descriptor ? 0 : comp.length, 18);
    local.writeUInt32LE(e.descriptor ? 0 : raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const desc = e.descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (e.descriptor) {
      desc.writeUInt32LE(0x08074b50, 0);
      desc.writeUInt32LE(crc, 4);
      desc.writeUInt32LE(comp.length, 8);
      desc.writeUInt32LE(raw.length, 12);
    }
    parts.push(local, name, comp, desc);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(flags, 8);
    cen.writeUInt16LE(e.method, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + comp.length + desc.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const SAMPLE: RawEntry[] = [
  { name: '[Content_Types].xml', data: '<Types/>', method: 0 },
  { name: 'word/document.xml', data: '<w:document>ශ්‍රී ලංකා</w:document>', method: 8 },
  { name: 'word/settings.xml', data: '<w:settings/>', method: 8, descriptor: true },
];

test('reads stored, deflated and data-descriptor entries', () => {
  const zip = DocxZip.read(buildZip(SAMPLE));
  assert.deepEqual(zip.names(), SAMPLE.map((e) => e.name));
  for (const e of SAMPLE) assert.equal(zip.getText(e.name), e.data);
  assert.equal(zip.has('missing.xml'), false);
  assert.equal(zip.get('missing.xml'), undefined);
});

test('writing back without changes keeps every entry and its compressed bytes', () => {
  const a = DocxZip.read(buildZip(SAMPLE));
  const b = DocxZip.read(a.write());
  assert.deepEqual(b.names(), a.names());
  a.entries.forEach((e, i) => assert.ok(b.entries[i]?.compressed.equals(e.compressed), e.name));
  // the data-descriptor flag is cleared: sizes and CRC are always in the headers written
  assert.equal((b.entries[2]?.flags ?? 0) & 0x0008, 0);
});

test('setText with the same content changes nothing; new content is deflated and readable', () => {
  const zip = DocxZip.read(buildZip(SAMPLE));
  zip.setText('[Content_Types].xml', '<Types/>');
  assert.equal(zip.entries[0]?.replaced, undefined, 'identical content is not marked replaced');
  zip.setText('word/document.xml', '<w:document>නව</w:document>');
  const again = DocxZip.read(zip.write());
  assert.equal(again.getText('word/document.xml'), '<w:document>නව</w:document>');
  assert.equal(again.entries[1]?.method, 8);
  assert.equal(again.getText('word/settings.xml'), '<w:settings/>');
  assert.throws(() => zip.setText('nope.xml', 'x'), /no entry/);
});

test('rejects files that are not ZIPs and compression it cannot read', () => {
  assert.throws(() => DocxZip.read(Buffer.from('not a zip at all')), /not a ZIP/);
  assert.throws(() => DocxZip.read(Buffer.alloc(0)), /not a ZIP/);
  const bad = buildZip([{ name: 'a.xml', data: 'x', method: 0 }]);
  // patch the central directory's method to 12 (bzip2)
  const cd = bad.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bad.writeUInt16LE(12, cd + 10);
  assert.throws(() => DocxZip.read(bad), /unsupported compression method 12/);
});
