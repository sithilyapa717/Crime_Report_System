// Local ownership guard (TEAM_WORK_SPLIT.md, "How accidental edits are prevented", rule 4).
// Runs as the pre-commit hook: refuses a commit that touches a file owned by someone else,
// using the same CODEOWNERS file GitHub uses. Works without GitHub.
//
// One-time setup per clone:  git config excise.github <your GitHub username>
// The project owner (owner of /CODEOWNERS) may commit anything.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @returns {{ pattern: string, owners: string[] }[]} */
export function parseCodeowners(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [pattern, ...owners] = l.split(/\s+/);
      return { pattern, owners: owners.map((o) => o.replace(/^@/, '').toLowerCase()) };
    });
}

/** Supports the forms our CODEOWNERS uses: `*`, `/dir/` and `/file`. */
function matches(pattern, file) {
  if (pattern === '*') return true;
  const p = pattern.replace(/^\//, '');
  return p.endsWith('/') ? file.startsWith(p) : file === p;
}

/** Owners of a repo-relative path; the last matching line wins, as on GitHub. */
export function ownersFor(rules, file) {
  let owners = [];
  for (const r of rules) if (matches(r.pattern, file)) owners = r.owners;
  return owners;
}

/** Files in `files` that `user` may not change. */
export function forbiddenFiles(rules, files, user) {
  const me = user.toLowerCase();
  if (ownersFor(rules, 'CODEOWNERS').includes(me)) return []; // project owner
  return files.filter((f) => !ownersFor(rules, f).includes(me));
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function main() {
  const root = git(['rev-parse', '--show-toplevel']);
  // Merging main into your branch brings in other members' files; that is fine.
  if (existsSync(join(git(['rev-parse', '--absolute-git-dir']), 'MERGE_HEAD'))) return 0;

  let user = '';
  try {
    user = git(['config', 'excise.github']);
  } catch {
    // not set
  }
  if (!user) {
    console.error(
      'owner-guard: tell the guard who you are (once per clone):\n' +
        '  git config excise.github <your GitHub username>',
    );
    return 1;
  }

  const rules = parseCodeowners(readFileSync(join(root, 'CODEOWNERS'), 'utf8'));
  const staged = git(['diff', '--cached', '--name-only', '--no-renames', '-z'])
    .split('\0')
    .filter(Boolean);
  const bad = forbiddenFiles(rules, staged, user);
  if (!bad.length) return 0;

  console.error(`owner-guard: @${user} does not own these staged files:`);
  for (const f of bad) console.error(`  ${f}  (owner: @${ownersFor(rules, f).join(', @')})`);
  console.error(
    '\nUnstage them, or ask the owner (issue or draft PR labelled "request").\n' +
      'See TEAM_WORK_SPLIT.md, "Asking for a change in someone else\'s folder".',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
