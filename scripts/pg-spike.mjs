// A15: `pnpm db:pg-spike` runs the repository contract suite on PostgreSQL. It starts a throwaway
// PostgreSQL cluster in a temp folder (local only, trust login, no password), runs the tests,
// then stops the cluster and deletes it. Needs PostgreSQL's programs (initdb, pg_ctl, createdb):
// PG_BIN, or C:\Program Files\PostgreSQL\16\bin.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = process.env.PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\16\\bin';
const PORT = process.env.PG_PORT ?? '54329';
const exe = (name) => join(BIN, process.platform === 'win32' ? `${name}.exe` : name);
const dir = mkdtempSync(join(tmpdir(), 'excise-pg-'));
const data = join(dir, 'data');

function step(name, args, opts = {}) {
  const r = spawnSync(exe(name), args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${name} failed (${r.status ?? r.error?.message})`);
}

let started = false;
let status = 1;
try {
  step('initdb', [
    '-D',
    data,
    '-U',
    'excise',
    '-A',
    'trust',
    '-E',
    'UTF8',
    '--locale=C',
    '--no-instructions',
  ]);
  step('pg_ctl', [
    '-D',
    data,
    '-o',
    `-p ${PORT} -c listen_addresses=localhost`,
    '-l',
    join(dir, 'pg.log'),
    '-w',
    'start',
  ]);
  started = true;
  step('createdb', ['-h', 'localhost', '-p', PORT, '-U', 'excise', 'excise_spike']);
  const r = spawnSync('pnpm', ['exec', 'vitest', 'run', 'tests/database/contract.test.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, EXCISE_PG_URL: `postgres://excise@localhost:${PORT}/excise_spike` },
  });
  status = r.status ?? 1;
} catch (e) {
  console.error(String(e));
} finally {
  if (started)
    spawnSync(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'inherit' });
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(status);
