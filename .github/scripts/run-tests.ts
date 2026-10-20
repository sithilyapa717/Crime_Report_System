// Runs one member's tests. Passes (with a notice) while the folders have no test files yet,
// and fails if tests exist but the test runner is not installed.
// "unit": files that import node:test run with `node --test` (no install needed), the rest with Vitest.
// Usage: node .github/scripts/run-tests.ts <unit|playwright> <folder>... [--exclude <folder>...]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { error, isUnder, notice, walk } from './ci-lib.ts';

const [runner, ...args] = process.argv.slice(2);
const split = args.indexOf('--exclude');
const include = split === -1 ? args : args.slice(0, split);
const exclude = split === -1 ? [] : args.slice(split + 1);
if ((runner !== 'unit' && runner !== 'playwright') || !include.length) {
  console.error('Usage: node run-tests.ts <unit|playwright> <folder>... [--exclude <folder>...]');
  process.exit(2);
}

const tests = include
  .flatMap((dir) => walk(dir))
  .filter((f) => /\.(test|spec)\.(c|m)?(t|j)sx?$/.test(f))
  .filter((f) => !exclude.some((d) => isUnder(f, d)));

if (!tests.length) {
  notice(`No ${runner} tests yet in: ${include.join(', ')}`);
  process.exit(0);
}

if (runner === 'unit') {
  const nodeTests = tests.filter((f) => /['"]node:test['"]/.test(readFileSync(f, 'utf8')));
  const vitestTests = tests.filter((f) => !nodeTests.includes(f));
  if (nodeTests.length) {
    console.log(`Running ${nodeTests.length} node:test file(s).`);
    run(process.execPath, ['--test', ...nodeTests]);
  }
  if (vitestTests.length) {
    requireInstalled('vitest', vitestTests.length);
    console.log(`Running ${vitestTests.length} Vitest file(s).`);
    run('pnpm', ['exec', 'vitest', 'run', ...vitestTests]);
  }
} else {
  requireInstalled('playwright', tests.length);
  console.log(`Running ${tests.length} Playwright file(s).`);
  run('pnpm', ['exec', 'playwright', 'install', '--with-deps', 'chromium']);
  // Electron needs a display on the Linux runner.
  // A folder with its own playwright.config.ts (tests/e2e) runs with that config.
  const configs = include.map((d) => `${d}/playwright.config.ts`).filter((f) => existsSync(f));
  const cmd = ['pnpm', 'exec', 'playwright', 'test', ...(configs.length ? configs.flatMap((c) => ['-c', c]) : include)];
  if (process.platform === 'linux' && !process.env.DISPLAY) run('xvfb-run', ['-a', ...cmd]);
  else run(cmd[0], cmd.slice(1));
}

function requireInstalled(bin: string, count: number): void {
  if (existsSync(`node_modules/.bin/${bin}`)) return;
  error(`Found ${count} ${bin} test file(s) but ${bin} is not installed. Add it to the root package.json (B) and commit pnpm-lock.yaml.`);
  process.exit(1);
}

function run(bin: string, args: string[]): void {
  const r = spawnSync(bin, args, { stdio: 'inherit', shell: process.platform === 'win32' && bin !== process.execPath });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
