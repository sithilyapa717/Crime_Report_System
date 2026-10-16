// Shared helpers for freezing and verifying the original Word templates.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const ORIGINALS_DIR = join(import.meta.dirname, '..', 'templates', 'original');
export const MANIFEST_PATH = join(ORIGINALS_DIR, 'MANIFEST.json');

export interface ManifestEntry {
  path: string; // relative to templates/original, forward slashes
  bytes: number;
  sha256: string;
}

export interface Manifest {
  source: string;
  frozenAt: string;
  files: ManifestEntry[];
  excluded: { path: string; reason: string }[];
}

export function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function listFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

export function toRel(root: string, file: string): string {
  return relative(root, file).split(sep).join('/');
}

/** Why a source file is not a usable template, or null if it is one. */
export function exclusionReason(file: string, bytes: number): string | null {
  const base = file.split(/[\\/]/).pop() ?? '';
  if (!base.toLowerCase().endsWith('.docx')) return 'not a .docx (reference material)';
  if (base.startsWith('~$')) return 'Word lock file';
  if (bytes === 0) return 'empty file (not a valid .docx)';
  return null;
}
