// Adds a template (or a new version of one) safely. See docs/document-catalogue/CATALOGUE.md,
// "Adding or replacing a template".
//
// Usage:
//   node packages/documents/scripts/add-template.ts <new.docx> <folder/name.docx>
//        [--offence PUDS,SUDS] [--family plaint] [--replaces "<old id>"] [--current]
import { join } from 'node:path';
import { REGISTRY_FILE, type TemplateFamily } from '../registry/registry.ts';
import { addTemplate, TemplateAdminError } from '../registry/template-admin.ts';
import { ORIGINALS_DIR } from './originals-lib.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.match(/^--(offence|family|replaces)$/));
const [source, targetPath] = positional;
if (!source || !targetPath) {
  console.error('Usage: node add-template.ts <new.docx> <folder/name.docx> [--offence A,B] [--family plaint] [--replaces "<old id>"] [--current]');
  process.exit(2);
}

try {
  const offence = flag('offence');
  const family = flag('family');
  const replaces = flag('replaces');
  const { entry, archived } = addTemplate(
    { originalsDir: ORIGINALS_DIR, registryFile: REGISTRY_FILE },
    {
      source,
      targetPath,
      ...(offence ? { offenceCodes: offence.split(/[,\s]+/).filter(Boolean) } : {}),
      ...(family ? { family: family as TemplateFamily } : {}),
      ...(replaces ? { replaces } : {}),
      current: args.includes('--current'),
    },
  );
  console.log(`Added ${entry.id} (${entry.family}, ${entry.offenceCodes.join(' ') || 'any offence'}, ${entry.status}).`);
  if (archived) console.log(`Archived ${archived.id}.`);
  const scripts = join('packages', 'documents', 'scripts');
  console.log(`
Next steps:
  1. node tests/documents-fidelity/approve-fixed-text.ts     (review the wording diff it creates)
  2. node ${join(scripts, 'inventory-templates.ts')}
  3. node ${join(scripts, 'family-audit.ts')} and node ${join(scripts, 'catalogue.ts')}
  4. node --test "packages/documents/**/*.test.ts" "tests/documents-fidelity/*.test.ts"
  5. Open a pull request; templates/original is read-only, so the project owner adds the
     "read-only-change" label after checking the new file.`);
} catch (e) {
  if (e instanceof TemplateAdminError) {
    console.error(`Not added: ${e.message}`);
    process.exit(1);
  }
  throw e;
}
