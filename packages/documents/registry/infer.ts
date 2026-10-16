// Reading a template's family, offence codes and variant from its folder and file name.
// Used to seed the registry and to propose an entry when a template is added; staff confirm.
import type { TemplateEntry, TemplateFamily, TemplateVariant } from './registry.ts';

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

export function offencesFor(folder: string, title: string): { codes: string[]; note?: string } {
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

export function familyFor(folder: string, title: string): TemplateFamily {
  if (folder === 'REWARDS') return 'reward-voucher';
  if (/මෝෂන්|මොෂන්/.test(title)) return 'motion-sheet';
  if (/වරෙන්තු දිර්ග/.test(title)) return 'warrant-extension';
  if (folder === 'පෙර වැරදි' || /පෙර වැරදි/.test(title)) return 'previous-record';
  if (/සාක්ෂි භාණ්ඩ/.test(title)) return 'production';
  if (/චෝදනා පත්/.test(title)) return 'charge-sheet';
  if (folder === 'Warrant' || folder === '(root)') return 'other';
  return 'plaint';
}

export function variantFor(title: string): TemplateVariant {
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

/** A proposed registry entry for a template at `path` (relative to templates/original). */
export function inferEntry(path: string): TemplateEntry {
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
}
