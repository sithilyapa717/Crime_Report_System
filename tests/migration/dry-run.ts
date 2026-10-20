// A14 dry run from the command line, before the app's import screen exists:
//
//   pnpm import:dry-run "D:\copy\Excise Department 2021.accdb" [expected-totals.json]
//
// Reads a COPY of the Access file, runs the importer against an empty in-memory database, and
// writes import-report.json and import-report.csv next to the expected-totals file (or into the
// current folder). Nothing is saved anywhere else; the Access file is never opened directly.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createMemoryRepositories } from '@excise/mocks';
import {
  accessReader,
  compareTotals,
  DefaultImportService,
  reportCsv,
  type ExpectedTotals,
} from '@excise/migration';

async function main(accdb: string, expectedFile: string | undefined): Promise<void> {
  const outDir = expectedFile ? dirname(resolve(expectedFile)) : process.cwd();
  const work = await mkdtemp(join(tmpdir(), 'excise-dry-run-'));
  const script = process.env.EXCISE_READ_ACCDB_SCRIPT;

  try {
    const repos = createMemoryRepositories();
    const svc = new DefaultImportService({
      read: accessReader(join(work, 'read'), script),
      references: repos.references,
      crs: repos.crs,
      cases: repos.cases,
      files: repos.files,
      audit: repos.audit,
      filesDir: join(work, 'files'),
      reportFile: join(outDir, 'import-report.json'),
      session: () => ({ userId: 'cli', username: 'cli', role: 'oic', mustChangePassword: false }),
    });
    const report = await svc.dryRun(resolve(accdb));
    await writeFile(join(outDir, 'import-report.csv'), reportCsv(report), 'utf8');

    console.log(
      `Rows read ${report.rowsRead}, would import ${report.imported}, skipped ${report.skipped}.`,
    );
    console.log(
      `Exceptions ${report.exceptions.length}, unknown names ${report.unverifiedRefs.length}.`,
    );
    console.log(`Unmapped columns (NOT imported): ${report.columns.unmapped.join(', ') || 'none'}`);
    console.log(`Columns not in the file: ${report.columns.missing.length}`);
    console.log('Totals:', JSON.stringify(report.totals, null, 2));

    if (expectedFile) {
      const expected = JSON.parse(await readFile(expectedFile, 'utf8')) as ExpectedTotals;
      const diff = compareTotals(expected, report.totals);
      if (diff.length) {
        console.log('Totals that DO NOT match the old Access reports:');
        for (const d of diff)
          console.log(`  ${d.what}: Access ${d.expected}, import ${d.imported}`);
        process.exitCode = 1;
      } else {
        console.log('All given totals match the old Access reports.');
      }
    }
    console.log(`Report: ${join(outDir, 'import-report.json')} and import-report.csv`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const [accdb, expectedFile] = process.argv.slice(2);
if (!accdb) {
  console.error('Usage: pnpm import:dry-run <file.accdb> [expected-totals.json]');
  process.exit(2);
}
main(accdb, expectedFile).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
