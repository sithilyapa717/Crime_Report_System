// A6: `pnpm db:load-test [count]` runs tests/database/load.test.ts with 100,000 CRs (or count).
import { spawnSync } from 'node:child_process';

const r = spawnSync('pnpm', ['exec', 'vitest', 'run', 'tests/database/load.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, EXCISE_LOAD_TEST: '1', EXCISE_LOAD_COUNT: process.argv[2] ?? '100000' },
});
process.exit(r.status ?? 1);
