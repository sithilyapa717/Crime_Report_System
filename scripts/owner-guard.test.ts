import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module without type declarations
import { forbiddenFiles, ownersFor, parseCodeowners } from './owner-guard.mjs';

type Rule = { pattern: string; owners: string[] };
const rules: Rule[] = parseCodeowners(
  readFileSync(new URL('../CODEOWNERS', import.meta.url), 'utf8'),
);

const B = 'senanayakenithikas-ux';
const A = 'yohanruchitha2-star';

describe('owner guard', () => {
  it('reads the real CODEOWNERS, last match wins', () => {
    expect(ownersFor(rules, 'packages/services/cr/src/index.ts')).toEqual([B]);
    expect(ownersFor(rules, 'packages/services/audit/src/index.ts')).toEqual([A]);
    expect(ownersFor(rules, 'apps/desktop/renderer/screens/admin/x.tsx')).toEqual([A]);
    expect(ownersFor(rules, 'apps/desktop/renderer/shell/x.tsx')).toEqual(['methulih']);
    expect(ownersFor(rules, 'package.json')).toEqual([B]);
  });

  it("refuses other members' files and allows shared locked files", () => {
    const files = [
      'packages/services/cr/src/index.ts',
      'packages/db/schema/x.sql',
      'packages/shared/contract/src/index.ts',
      'TEAM_WORK_SPLIT.md',
    ];
    expect(forbiddenFiles(rules, files, B)).toEqual([
      'packages/db/schema/x.sql',
      'TEAM_WORK_SPLIT.md',
    ]);
    expect(forbiddenFiles(rules, files, A)).toEqual([
      'packages/services/cr/src/index.ts',
      'TEAM_WORK_SPLIT.md',
    ]);
  });

  it('lets the project owner commit anything, case-insensitively', () => {
    expect(forbiddenFiles(rules, ['packages/db/x.ts', 'CODEOWNERS'], 'SithilYapa717')).toEqual([]);
  });
});
