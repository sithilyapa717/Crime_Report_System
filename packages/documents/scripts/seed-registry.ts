// Seeds registry/templates.json from the frozen originals, once. After that the file is maintained
// by hand (staff decisions: current / archived, corrected offence codes), so this script refuses
// to overwrite it. Everything it infers is from folder and file names and starts "unconfirmed".
//
// Usage: node packages/documents/scripts/seed-registry.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { REGISTRY_FILE, type TemplateEntry, type TemplateFamily, type TemplateVariant } from '../registry/registry.ts';
import { MANIFEST_PATH, type Manifest } from './originals-lib.ts';

if (existsSync(REGISTRY_FILE)) {
  console.error(`${REGISTRY_FILE} exists; it is maintained by hand now.`);
  process.exit(1);
}

// Folder = offence code(s) (REWRITE_PLAN §1.7). Folders not listed serve any offence.
const FOLDER_OFFENCES: Record<string, string[]> = {
  PUDS: ['PUDS'],
  'SUDS-PUDS': ['SUDS', 'PUDS'],
  PUML: ['PUML'],
  'SUML-PUML': ['SUML', 'PUML'],
  UCG: ['UCG'],
  UMA: ['UMA'],
  UPG: ['UPG'],
  UPH: ['UPH'],
  UPS: ['UPS'],
  UPT: ['UPT'],
  UST: ['UST'],
  'UST-UPT': ['UST', 'UPT'],
  USA: ['USA'],
  USFL: ['USFL'],
  'PUMB 2021.02.11': ['PUMB'],
};

function offencesFor(folder: string, title: string): { codes: string[]; note?: string } {
  if (folder === 'USA-UPA') {
    if (/^USFL UPFL/i.test(title)) return { codes: ['USFL', 'UPFL'] };
    if (/^USA UPA/i.test(title)) return { codes: ['USA', 'UPA'] };
    if (/^UPFL/i.test(title)) return { codes: ['UPFL'] };
    if (/^UPA/i.test(title)) return { codes: ['UPA'] };
  }
  if (folder === 'GOLD LEAF') {
    if (/PDFC/i.test(title)) return { codes: ['PDFC'] };
    if (/PUMB/i.test(title)) return { codes: ['PUMB'] };
    return { codes: [], note: 'cigarette/beedi template: offence code to confirm' };
  }
  const codes = FOLDER_OFFENCES[folder];
  return codes ? { codes } : { codes: [] };
}

function familyFor(folder: string, title: string): TemplateFamily {
  if (folder === 'REWARDS') return 'reward-voucher';
  if (/මෝෂන්|මොෂන්/.test(title)) return 'motion-sheet';
  if (/වරෙන්තු දිර්ග/.test(title)) return 'warrant-extension';
  if (folder === 'පෙර වැරදි' || /පෙර වැරදි/.test(title)) return 'previous-record';
  if (/සාක්ෂි භාණ්ඩ/.test(title)) return 'production';
  if (/චෝදනා පත්/.test(title)) return 'charge-sheet';
  if (folder === 'Warrant' || folder === '(root)') return 'other';
  return 'plaint';
}

function variantFor(title: string): TemplateVariant {
  const v: TemplateVariant = {};
  // "කෑනය සාම්පල් බෝතලය" is a can with the sample in a bottle, so the can wins
  if (/කෑන|කැන්/.test(title)) v.container = 'can';
  else if (/බෝතල/.test(title)) v.container = 'bottle';
  if (/සාම්පල් නැත/.test(title)) v.sample = false;
  else if (/සාම්පල්/.test(title)) v.sample = true;
  const ml = /\b(180|375|750)\b/.exec(title);
  if (ml) v.volumeMl = Number(ml[1]);
  const rs = /රු\s?(500|1000)/.exec(title);
  if (rs) v.noteRs = Number(rs[1]);
  const off = /(\d)\s*OFFENCE/i.exec(title);
  if (off) v.offences = Number(off[1]);
  return v;
}

const looksLikeCopy = (title: string) => /\.docx|\s1{2,}\b|\s1{2,}\s|\s\d$/.test(title) || /^a+$/.test(title);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
const templates: TemplateEntry[] = manifest.files.map(({ path }) => {
  const folder = path.includes('/') ? path.slice(0, path.indexOf('/')) : '(root)';
  const title = path.slice(path.lastIndexOf('/') + 1).replace(/\.docx$/i, '');
  const offences = offencesFor(folder, title);
  const bare = !/රු/.test(title) && /\b(500|1000)\b/.exec(title);
  const notes = [
    offences.note,
    bare ? `"${bare[1]}" in the name: note value (Rs) or volume (ml)? to confirm` : undefined,
    looksLikeCopy(title) ? 'file name looks like a saved-again copy' : undefined,
  ]
    .filter(Boolean)
    .join('; ');
  return {
    id: path,
    title,
    family: familyFor(folder, title),
    offenceCodes: offences.codes,
    variant: variantFor(title),
    status: 'unconfirmed',
    ...(notes ? { notes } : {}),
  };
});

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
