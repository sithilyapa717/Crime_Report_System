// Fails if a change touches a read-only zone (TEAM_WORK_SPLIT.md rule 5) and
// warns when it touches a locked shared file (rule 6: needs all four approvals).
// Usage: node .github/scripts/guard-readonly.ts <base-commit> <head-commit>
import { execFileSync } from 'node:child_process';
import { error, isUnder, warning } from './ci-lib.ts';

const READ_ONLY = [
  'prototype/',
  'packages/documents/templates/original/',
  'docs/legacy-screenshots/',
  'docs/LEGACY_SCREEN_INVENTORY.md',
  'docs/LEGACY_QUERY_CATALOG.md',
  'REWRITE_PLAN.md',
  'TEAM_WORK_SPLIT.md',
];
const LOCKED = ['packages/shared/labels/', 'packages/shared/contract/'];

const [base, head = 'HEAD'] = process.argv.slice(2);
if (!base || /^0+$/.test(base) || !commitExists(base)) {
  console.log('No earlier commit to compare with; read-only check skipped.');
  process.exit(0);
}

const changed = execFileSync('git', ['diff', '--name-only', '-z', `${base}...${head}`], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const blocked = changed.filter((f) => READ_ONLY.some((zone) => isUnder(f, zone)));
for (const f of blocked) error('This file is read-only. Ask the project owner; they can add the "read-only-change" label to allow it.', f);

for (const f of changed.filter((f) => LOCKED.some((zone) => isUnder(f, zone)))) {
  warning('Locked shared file: this change needs approval from all four members (A, B, C and D).', f);
}

if (blocked.length) {
  console.error(`Read-only check FAILED: ${blocked.length} protected file(s) changed.`);
  process.exit(1);
}
console.log(`Read-only check OK: ${changed.length} changed file(s), none protected.`);

function commitExists(sha: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
