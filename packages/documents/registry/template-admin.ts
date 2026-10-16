// Adding a template, or a new version of one, without ever touching an existing original
// (D11 "how to add or replace one safely"). A new version is added under a new file name and the
// old one is archived, so documents generated earlier can always be traced to the exact file used.
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fillTemplate } from '../engine/fill.ts';
import { DocxZip } from '../engine/zip.ts';
import { inferEntry } from './infer.ts';
import type { TemplateEntry, TemplateFamily } from './registry.ts';

export interface AddTemplateInput {
  /** The new .docx, anywhere on disk. */
  source: string;
  /** Where it goes under templates/original, e.g. "PUDS/puds බෝතලය 2027.docx". */
  targetPath: string;
  family?: TemplateFamily;
  offenceCodes?: string[];
  /** Id of the template this one replaces; that one is archived. */
  replaces?: string;
  /** Staff already confirmed this is the version in use. */
  current?: boolean;
}

export interface AdminPaths {
  originalsDir: string; // holds MANIFEST.json
  registryFile: string;
}

interface Manifest {
  files: { path: string; bytes: number; sha256: string }[];
  [key: string]: unknown;
}

export class TemplateAdminError extends Error {}

export function addTemplate(paths: AdminPaths, input: AddTemplateInput): { entry: TemplateEntry; archived?: TemplateEntry } {
  const target = input.targetPath.replace(/\\/g, '/');
  if (!/\.docx$/i.test(target)) throw new TemplateAdminError('target must be a .docx file');
  if (target.startsWith('/') || target.split('/').includes('..')) throw new TemplateAdminError('target must be a path inside templates/original');

  const manifestPath = join(paths.originalsDir, 'MANIFEST.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const registry = JSON.parse(readFileSync(paths.registryFile, 'utf8')) as { templates: TemplateEntry[]; [k: string]: unknown };
  const targetFile = join(paths.originalsDir, target);
  if (existsSync(targetFile) || manifest.files.some((f) => f.path === target)) {
    throw new TemplateAdminError(`${target} already exists; originals are never overwritten, use a new file name`);
  }
  const replaced = input.replaces ? registry.templates.find((e) => e.id === input.replaces) : undefined;
  if (input.replaces && !replaced) throw new TemplateAdminError(`unknown template to replace: ${input.replaces}`);

  // must be a real Word document whose fields the mapping knows
  const bytes = readFileSync(input.source);
  let zip: DocxZip;
  try {
    zip = DocxZip.read(bytes);
  } catch (e) {
    throw new TemplateAdminError(`not a valid .docx: ${(e as Error).message}`);
  }
  if (!zip.has('word/document.xml')) throw new TemplateAdminError('not a Word document (no word/document.xml)');
  const { report } = fillTemplate(bytes, {}, { failOnUnknownField: false });
  if (report.unknown.length) {
    throw new TemplateAdminError(
      `fields not in the mapping: ${report.unknown.join(', ')}. Add them to packages/documents/mapping/fields.ts first.`,
    );
  }
  if (report.unsupported.length) throw new TemplateAdminError(`nested merge fields are not supported: ${report.unsupported.join(', ')}`);

  const proposed = inferEntry(target);
  const entry: TemplateEntry = {
    ...proposed,
    ...(input.family ? { family: input.family } : {}),
    ...(input.offenceCodes ? { offenceCodes: input.offenceCodes.map((c) => c.toUpperCase()) } : {}),
    status: input.current ? 'current' : 'unconfirmed',
    ...(replaced ? { notes: [proposed.notes, `replaces ${replaced.id}`].filter(Boolean).join('; ') } : {}),
  };
  for (const code of entry.offenceCodes) {
    if (!/^[A-Z]{2,6}$/.test(code)) throw new TemplateAdminError(`offence code looks wrong: ${code}`);
  }

  mkdirSync(dirname(targetFile), { recursive: true });
  copyFileSync(input.source, targetFile);
  chmodSync(targetFile, 0o444);
  const sha256 = createHash('sha256').update(readFileSync(targetFile)).digest('hex');
  manifest.files.push({ path: target, bytes: bytes.length, sha256 });
  manifest.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  let archived: TemplateEntry | undefined;
  registry.templates = registry.templates.map((e) => {
    if (e.id !== input.replaces) return e;
    archived = { ...e, status: 'archived', notes: [e.notes, `replaced by ${target}`].filter(Boolean).join('; ') };
    return archived;
  });
  registry.templates.push(entry);
  writeFileSync(paths.registryFile, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  return { entry, ...(archived ? { archived } : {}) };
}
