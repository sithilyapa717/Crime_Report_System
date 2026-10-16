// Which fonts do the templates use, and which of them are missing on this PC? (REWRITE_PLAN §6.8)
// A missing font does not change a document's wording, but Word shows it in another font, so the
// printout can look different from the old one. Run on each office PC after installing the app.
//
// Usage: node packages/documents/scripts/check-fonts.ts   (exit 1 if a font is missing)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const INVENTORY = join(import.meta.dirname, '..', 'registry', 'template-inventory.json');

export function fontUsage(templates: { path: string; fonts: string[] }[]): Map<string, number> {
  const usage = new Map<string, number>();
  for (const t of templates) for (const f of t.fonts) usage.set(f, (usage.get(f) ?? 0) + 1);
  return usage;
}

/** Font family names registered in Windows (machine and user), lower-case. */
function installedFonts(): Set<string> | null {
  if (process.platform !== 'win32') return null;
  const script =
    "$k='HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts','HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';" +
    "$k | ForEach-Object { if (Test-Path $_) { (Get-ItemProperty $_).PSObject.Properties.Name } }";
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  const names = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    // "Iskoola Pota Bold (TrueType)", "Nirmala UI & Nirmala UI Bold (TrueType)"
    for (const part of line.replace(/\s*\((TrueType|OpenType|All res)\)\s*$/i, '').split('&')) {
      const name = part.trim().replace(/\s+(Bold Italic|Bold|Italic|Regular|Light|Semilight|Semibold)$/i, '');
      if (name) names.add(name.toLowerCase());
    }
  }
  return names;
}

const templates = (JSON.parse(readFileSync(INVENTORY, 'utf8')) as { templates: { path: string; fonts: string[] }[] }).templates;
const usage = [...fontUsage(templates)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const installed = installedFonts();

console.log(`Fonts used by the ${templates.length} templates${installed ? ' (✓ installed, ✗ missing on this PC)' : ''}:\n`);
let missing = 0;
for (const [font, count] of usage) {
  const mark = installed ? (installed.has(font.toLowerCase()) ? '✓' : '✗') : ' ';
  if (mark === '✗') missing++;
  console.log(`  ${mark} ${font.padEnd(24)} ${count} template(s)`);
}
if (installed) {
  console.log(missing ? `\n${missing} font(s) missing. See docs/admin-guide/DOCUMENTS_ADMIN.md, "Fonts".` : '\nAll fonts are installed.');
  process.exit(missing ? 1 : 0);
}
