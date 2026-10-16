// Phase 0: copy the original Word templates into templates/original/ unchanged,
// mark them read-only and write MANIFEST.json with a SHA-256 per file.
//
// Usage: node packages/documents/scripts/freeze-originals.ts "<path to Word Document edit>"
// Refuses to run if a manifest already exists (originals are frozen once).
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  MANIFEST_PATH,
  ORIGINALS_DIR,
  exclusionReason,
  listFiles,
  sha256,
  toRel,
  type Manifest,
} from './originals-lib.ts';

const source = process.argv[2];
if (!source) {
  console.error('Usage: node freeze-originals.ts "<path to Word Document edit>"');
  process.exit(2);
}
if (existsSync(MANIFEST_PATH)) {
  console.error(`Already frozen: ${MANIFEST_PATH}. Originals are never re-copied.`);
  process.exit(1);
}

const sourceRoot = resolve(source);
const manifest: Manifest = {
  source: sourceRoot,
  frozenAt: new Date().toISOString(),
  files: [],
  excluded: [],
};

for (const file of listFiles(sourceRoot)) {
  const rel = toRel(sourceRoot, file);
  const bytes = statSync(file).size;
  const reason = exclusionReason(file, bytes);
  if (reason) {
    manifest.excluded.push({ path: rel, reason });
    continue;
  }
  const target = join(ORIGINALS_DIR, rel);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
  chmodSync(target, 0o444);
  const hash = sha256(target);
  if (hash !== sha256(file)) throw new Error(`Copy mismatch: ${rel}`);
  manifest.files.push({ path: rel, bytes, sha256: hash });
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Frozen ${manifest.files.length} templates, excluded ${manifest.excluded.length}.`);
for (const e of manifest.excluded) console.log(`  excluded: ${e.path} (${e.reason})`);
