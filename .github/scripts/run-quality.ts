// Lint, format check, TypeScript compile and build from the root package.json (B's root config).
// Passes with a notice until the root package.json exists. After that, "lint" and "typecheck"
// scripts are required (team rule: both must pass before a pull request); "format:check",
// "build" and the given extra scripts run when present.
// Usage: node .github/scripts/run-quality.ts [extra-script...]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { error, notice } from './ci-lib.ts';

if (!existsSync('package.json')) {
  notice('No root package.json yet (B). Lint, format and typecheck start once it exists.');
  process.exit(0);
}

const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {};
const required = ['lint', 'typecheck'];
const missing = required.filter((s) => !scripts[s]);
if (missing.length) {
  for (const s of missing) error(`Add a "${s}" script to the root package.json.`, 'package.json');
  process.exit(1);
}

const wanted = process.argv.length > 2 ? process.argv.slice(2) : [...required, 'format:check', 'build'];
for (const s of wanted) {
  if (!scripts[s]) {
    console.log(`(no "${s}" script, skipped)`);
    continue;
  }
  console.log(`\n> pnpm run ${s}`);
  const r = spawnSync('pnpm', ['run', s], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
