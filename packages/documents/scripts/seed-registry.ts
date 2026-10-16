// Seeds registry/templates.json from the frozen originals, once. After that the file is maintained
// by hand (staff decisions: current / archived, corrected offence codes), so this script refuses
// to overwrite it. Everything it infers is from folder and file names and starts "unconfirmed".
//
// Usage: node packages/documents/scripts/seed-registry.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { inferEntry } from '../registry/infer.ts';
import { REGISTRY_FILE } from '../registry/registry.ts';
import { MANIFEST_PATH, type Manifest } from './originals-lib.ts';

if (existsSync(REGISTRY_FILE)) {
  console.error(`${REGISTRY_FILE} exists; it is maintained by hand now.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
const templates = manifest.files.map(({ path }) => inferEntry(path));

writeFileSync(
  REGISTRY_FILE,
  JSON.stringify(
    {
      about:
        'Template registry (D5). Seeded from file names by scripts/seed-registry.ts; maintained by hand. ' +
        'Set status to "current" or "archived" when staff decide (REWRITE_PLAN §10 Q3).',
      templates,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log(`Seeded ${templates.length} registry entries → ${REGISTRY_FILE}`);
