// Applies a review sheet returned by staff (review-sheet.csv from review-pack.ts) to
// registry/templates.json: decisions → status, corrected offence codes, comments → notes.
// Nothing is written if any row has an error. Use --dry-run to only show the changes.
//
// Usage: node packages/documents/scripts/apply-review.ts <review-sheet.csv> [--dry-run]
import { readFileSync, writeFileSync } from 'node:fs';
import { REGISTRY_FILE, type TemplateEntry } from '../registry/registry.ts';
import { applyReview, parseCsv } from '../registry/review.ts';

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--'));
if (!csvPath) {
  console.error('Usage: node apply-review.ts <review-sheet.csv> [--dry-run]');
  process.exit(2);
}

let text: string;
try {
  text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(csvPath));
} catch {
  console.error('The sheet is not UTF-8. In Excel use File → Save As → "CSV UTF-8 (Comma delimited)".');
  process.exit(1);
}

const registry = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')) as { about: string; templates: TemplateEntry[] };
const result = applyReview(registry.templates, parseCsv(text));

if (result.errors.length) {
  console.error(`Nothing applied, ${result.errors.length} problem(s):`);
  for (const e of result.errors) console.error(`  ${e}`);
  process.exit(1);
}
for (const c of result.changed) console.log(`${c.title}: ${c.changes.join('; ')}`);
console.log(`${result.changed.length} template(s) changed.`);
if (!args.includes('--dry-run') && result.changed.length) {
  writeFileSync(REGISTRY_FILE, JSON.stringify({ ...registry, templates: result.entries }, null, 2) + '\n', 'utf8');
  console.log(`Updated ${REGISTRY_FILE}`);
}
