// Phase 0 guard: fails (exit 1) if any frozen template was changed, added or removed.
// Usage: node packages/documents/scripts/verify-originals.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST_PATH, ORIGINALS_DIR, listFiles, sha256, toRel, type Manifest } from './originals-lib.ts';

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
const expected = new Map(manifest.files.map((f) => [f.path, f.sha256]));
const problems: string[] = [];

const onDisk = listFiles(ORIGINALS_DIR)
  .map((f) => toRel(ORIGINALS_DIR, f))
  .filter((p) => p !== 'MANIFEST.json' && p !== '.gitkeep');

for (const rel of onDisk) {
  const want = expected.get(rel);
  if (!want) problems.push(`not in manifest: ${rel}`);
  else if (sha256(join(ORIGINALS_DIR, rel)) !== want) problems.push(`CHANGED: ${rel}`);
}
const present = new Set(onDisk);
for (const rel of expected.keys()) if (!present.has(rel)) problems.push(`missing: ${rel}`);

if (problems.length) {
  console.error(`Original templates check FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Original templates OK: ${expected.size} files match MANIFEST.json.`);
