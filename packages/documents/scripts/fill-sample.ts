// Fill frozen templates with the made-up sample CR, for a visual check in Word.
//
// Usage:
//   node packages/documents/scripts/fill-sample.ts <out dir> [template path relative to templates/original]
// With no template given, every template in MANIFEST.json is filled.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fillTemplate } from '../engine/index.ts';
import { SAMPLE_CR } from '../mapping/sample-data.ts';
import { MANIFEST_PATH, ORIGINALS_DIR, type Manifest } from './originals-lib.ts';

const [outDir, only] = process.argv.slice(2);
if (!outDir) {
  console.error('Usage: node fill-sample.ts <out dir> [template path]');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
const paths = only ? [only] : manifest.files.map((f) => f.path);

let failed = 0;
for (const rel of paths) {
  try {
    const { docx, report } = fillTemplate(readFileSync(join(ORIGINALS_DIR, rel)), SAMPLE_CR);
    const target = join(outDir, rel.replace(/\.docx$/i, ' - SAMPLE 12-2026.docx'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, docx);
    const extra = [
      report.missing.length ? `empty: ${report.missing.join(', ')}` : '',
      report.unsupported.length ? `UNSUPPORTED: ${report.unsupported.join(', ')}` : '',
    ].filter(Boolean);
    console.log(`ok   ${rel}  (${report.occurrences} fields)${extra.length ? '  ' + extra.join('; ') : ''}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${rel}: ${(e as Error).message}`);
  }
}
console.log(`\n${paths.length - failed} filled, ${failed} failed → ${outDir}`);
process.exit(failed ? 1 : 0);
