// Wording snapshot: the fixed text of every frozen template must match its approved
// snapshot in fixed-text/. A change needs approve-fixed-text.ts and a reviewed diff.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { DocxZip } from '../../packages/documents/engine/zip.ts';
import { fixedText } from './fidelity-lib.ts';

const ORIGINALS = join(import.meta.dirname, '..', '..', 'packages', 'documents', 'templates', 'original');
const SNAPSHOT_DIR = join(import.meta.dirname, 'fixed-text');
const manifest = JSON.parse(readFileSync(join(ORIGINALS, 'MANIFEST.json'), 'utf8')) as { files: { path: string }[] };

// Git may check text files out with CRLF on Windows; the snapshot is compared with LF.
const readSnapshot = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function listTxt(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    return statSync(full).isDirectory() ? listTxt(full) : n.endsWith('.txt') ? [full] : [];
  });
}

test('one wording snapshot per frozen template, and no extra snapshots', () => {
  const snapshots = listTxt(SNAPSHOT_DIR)
    .map((f) => relative(SNAPSHOT_DIR, f).split(sep).join('/').replace(/\.txt$/, ''))
    .sort();
  assert.deepEqual(snapshots, manifest.files.map((f) => f.path).sort());
});

for (const { path } of manifest.files) {
  test(`wording unchanged: ${path}`, () => {
    const snapshot = join(SNAPSHOT_DIR, `${path}.txt`);
    assert.ok(existsSync(snapshot), 'no approved snapshot; run approve-fixed-text.ts');
    const actual = fixedText(DocxZip.read(readFileSync(join(ORIGINALS, path))));
    assert.equal(actual, readSnapshot(snapshot), 'template wording differs from the approved snapshot');
  });
}
