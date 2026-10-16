// Layer rules (TEAM_WORK_SPLIT.md rule 7):
//   - UI code may not import from packages/db
//   - services may not contain SQL
//   - packages/db may not import UI or services
//   - only packages/db (and A's Access importer) may use a database driver; .sql files live in packages/db
// Usage: node .github/scripts/check-layers.ts
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { error, isUnder, walk } from './ci-lib.ts';

const UI = 'apps/desktop/renderer';
const SERVICES = 'packages/services';
const DB = 'packages/db';
const DRIVER_ALLOWED = [DB, 'packages/migration', 'tests/migration'];
const DRIVERS = /^(better-sqlite3|kysely|pg|postgres|sqlite3|node:sqlite|mysql2?)(\/|$)/;
const SOURCE = /\.(c|m)?(t|j)sx?$/;
const IMPORT =
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
// Upper-case SQL inside a string or template literal. Case-sensitive so English UI text ("Select from the list") does not match.
const SQL = /['"`]\s*(SELECT\s[\s\S]{0,200}?\sFROM\s|INSERT\s+INTO\s|UPDATE\s+\w+\s+SET\s|DELETE\s+FROM\s|(CREATE|DROP|ALTER)\s+(TABLE|INDEX|VIEW|TRIGGER)\s)/;

const packageDirs = workspacePackages();
const files = [...walk('apps'), ...walk('packages'), ...walk('tests')];
let problems = 0;

for (const file of files) {
  if (file.endsWith('.sql') && !isUnder(file, DB)) report('SQL files belong in packages/db (owner A).', file);
  if (!SOURCE.test(file)) continue;

  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    const line = text.slice(0, m.index).split('\n').length;
    const target = resolveImport(file, spec);

    if (DRIVERS.test(spec) && !DRIVER_ALLOWED.some((d) => isUnder(file, d)))
      report(`Database driver "${spec}" may only be used in packages/db.`, file, line);
    if (isUnder(file, UI) && target && isUnder(target, DB))
      report('UI code may not import from packages/db. Go through a service.', file, line);
    if (isUnder(file, DB) && target && (isUnder(target, UI) || isUnder(target, SERVICES)))
      report('packages/db may not import UI or services code.', file, line);
  }

  if (isUnder(file, SERVICES)) {
    const m = SQL.exec(text);
    if (m) report('Services may not contain SQL. Move the query into a repository in packages/db.', file, text.slice(0, m.index).split('\n').length);
  }
}

if (problems) {
  console.error(`Layer rules FAILED: ${problems} problem(s).`);
  process.exit(1);
}
console.log(`Layer rules OK: ${files.filter((f) => SOURCE.test(f)).length} source file(s) checked.`);

function report(message: string, file: string, line?: number): void {
  problems++;
  error(message, file, line);
}

/** Folder (relative to the root) that an import points at, or null for an outside package. */
function resolveImport(from: string, spec: string): string | null {
  if (spec.startsWith('.')) return posix.normalize(posix.join(posix.dirname(from), spec));
  for (const [name, dir] of packageDirs) if (spec === name || spec.startsWith(`${name}/`)) return dir;
  return null;
}

/** Workspace package names mapped to their folders, from every package.json under apps/ and packages/. */
function workspacePackages(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of [...walk('apps'), ...walk('packages')]) {
    if (!f.endsWith('/package.json')) continue;
    const name = (JSON.parse(readFileSync(join(f), 'utf8')) as { name?: string }).name;
    if (name) out.set(name, dirname(f).split('\\').join('/'));
  }
  return out;
}
