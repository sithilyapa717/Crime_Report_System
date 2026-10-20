// Runs tests/migration/dry-run.ts: bundles it (workspace packages are TypeScript) and starts it.
// Usage: node tests/migration/run-cli.mjs <file.accdb> [expected-totals.json]
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const here = import.meta.dirname;
const root = join(here, '../..');
const out = join(here, '.cache', 'dry-run.cjs');
mkdirSync(join(here, '.cache'), { recursive: true });
await build({
  entryPoints: [join(here, 'dry-run.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
  define: { 'import.meta.dirname': 'undefined' },
  // The Argon2 native module cannot be bundled; it is loaded from the auth package.
  external: ['@node-rs/*'],
});
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_PATH: join(root, 'packages/services/auth/node_modules'),
    EXCISE_READ_ACCDB_SCRIPT: join(root, 'packages/migration/src/reader/read-accdb.ps1'),
  },
});
process.exit(r.status ?? 1);
