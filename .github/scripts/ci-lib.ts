// Shared helpers for the CI scripts. Paths are relative to the repository root (the working directory).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const ROOT = process.cwd();

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'build', 'coverage', 'release']);

/** Every file under `dir` (relative to the root, forward slashes), skipping build output and node_modules. */
export function walk(dir: string): string[] {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  if (!statSync(full).isDirectory()) return [toPosix(dir)];
  const out: string[] = [];
  for (const name of readdirSync(full)) {
    if (SKIP_DIRS.has(name)) continue;
    out.push(...walk(join(dir, name)));
  }
  return out.sort();
}

export function toPosix(p: string): string {
  return relative(ROOT, join(ROOT, p)).split(sep).join('/');
}

export function isUnder(file: string, dir: string): boolean {
  const d = dir.endsWith('/') ? dir : `${dir}/`;
  return file === dir || file.startsWith(d);
}

// GitHub Actions annotations: shown on the pull request next to the file.
export function error(message: string, file?: string, line?: number): void {
  console.log(`::error${annotationProps(file, line)}::${message}`);
}
export function warning(message: string, file?: string): void {
  console.log(`::warning${annotationProps(file)}::${message}`);
}
export function notice(message: string): void {
  console.log(`::notice::${message}`);
}
function annotationProps(file?: string, line?: number): string {
  if (!file) return '';
  return ` file=${file}${line ? `,line=${line}` : ''}`;
}
