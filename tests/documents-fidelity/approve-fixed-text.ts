// Writes the approved wording snapshot: one .txt per frozen template under fixed-text/,
// holding the template's fixed text (all wording outside merge fields).
//
// Run only after a deliberate, approved template change (a new template or a staff-approved
// new version). The pull request then shows the wording change as a readable diff.
// Usage: node tests/documents-fidelity/approve-fixed-text.ts
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DocxZip } from '../../packages/documents/engine/zip.ts';
import { fixedText } from './fidelity-lib.ts';

const ORIGINALS = join(import.meta.dirname, '..', '..', 'packages', 'documents', 'templates', 'original');
export const SNAPSHOT_DIR = join(import.meta.dirname, 'fixed-text');

const manifest = JSON.parse(readFileSync(join(ORIGINALS, 'MANIFEST.json'), 'utf8')) as { files: { path: string }[] };

rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
for (const { path } of manifest.files) {
  const target = join(SNAPSHOT_DIR, `${path}.txt`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, fixedText(DocxZip.read(readFileSync(join(ORIGINALS, path)))), 'utf8');
}
console.log(`Wrote ${manifest.files.length} wording snapshots to ${SNAPSHOT_DIR}`);
