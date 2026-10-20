// A14: the reader and importer on a real Access file, built by fixtures/make-accdb.ps1.
// Windows with the Access Database Engine only; skipped elsewhere (CI runs on Linux).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Session } from '@excise/contract';
import { createMemoryRepositories } from '@excise/mocks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessReader, DefaultImportService, type LegacyDatabase } from '@excise/migration';

const run = promisify(execFile);
const FIXTURE = join(__dirname, 'fixtures', 'make-accdb.ps1');
const SCRIPT = join(__dirname, '../../packages/migration/src/reader/read-accdb.ps1');

let tmp = '';
let accdb = '';
let engine = process.platform === 'win32';

const NAME_SI = 'ඒ. බී. කුමාර';
const COURT_SI = 'මීගමුව මහේස්ත්‍රාත් අධිකරණය';

beforeAll(async () => {
  if (!engine) return;
  tmp = await mkdtemp(join(tmpdir(), 'excise-accdb-'));
  const picture = join(tmp, 'scene.png');
  await writeFile(picture, 'not-really-a-png');
  const spec = {
    tables: [
      {
        name: 'Office',
        fields: [
          { name: 'CR NO 2017', type: 'text' },
          { name: 'YearCR', type: 'long' },
          { name: 'office', type: 'text' },
          { name: 'month', type: 'text' },
          { name: 'fistsecon', type: 'text' },
          { name: 'Date of Detection', type: 'date' },
          { name: 'Offence', type: 'text' },
          { name: 'Name of Accused', type: 'text' },
          { name: 'NIC No of Accused', type: 'text' },
          { name: 'Name of Court', type: 'text' },
          { name: 'Date of Court', type: 'text' },
          { name: 'Case no', type: 'text' },
          { name: 'T/R', type: 'yesno' },
          { name: 'result', type: 'currency' },
          { name: 'picture', type: 'attachment' },
        ],
        rows: [
          {
            'CR NO 2017': '1/2026',
            YearCR: 2026,
            office: 'Negombo',
            month: 'January',
            fistsecon: 'පළමු අඩවසර',
            'Date of Detection': '2026-01-02',
            Offence: 'PUDS',
            'Name of Accused': NAME_SI,
            'NIC No of Accused': '851234567V',
            'Name of Court': COURT_SI,
            'Date of Court': '2026.01.10',
            'Case no': 'B/101/26',
            'T/R': true,
            result: 1500.5,
            picture,
          },
          {
            'CR NO 2017': '2/2026',
            YearCR: 2026,
            office: 'Negombo',
            month: 'February',
            fistsecon: 'පළමු අඩවසර',
            'Date of Detection': '2026-02-03',
            Offence: 'UPG',
            'Name of Accused': 'Second Accused',
            'T/R': false,
          },
        ],
      },
      {
        name: 'Table offence',
        fields: [
          { name: 'Offence', type: 'text' },
          { name: 'Offence name', type: 'text' },
        ],
        rows: [
          { Offence: 'PUDS', 'Offence name': 'ස්ප්‍රීතු' },
          { Offence: 'UPG', 'Offence name': 'ගංජා' },
        ],
      },
    ],
  };
  const specFile = join(tmp, 'spec.json');
  await writeFile(specFile, JSON.stringify(spec), 'utf8');
  accdb = join(tmp, 'legacy.accdb');
  try {
    await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        FIXTURE,
        specFile,
        accdb,
      ],
      {
        windowsHide: true,
        timeout: 120_000,
      },
    );
  } catch (e) {
    if ((e as { code?: number }).code === 3)
      engine = false; // no Access engine on this PC
    else throw e;
  }
}, 180_000);

afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe.skipIf(process.platform !== 'win32')('real Access file', () => {
  let legacy: LegacyDatabase;

  it('reads tables, Sinhala text, dates, flags, money and attachments from a copy', async (ctx) => {
    if (!engine) return ctx.skip(); // no Access Database Engine on this PC
    const before = (await stat(accdb)).mtimeMs;
    legacy = await accessReader(join(tmp, 'work'), SCRIPT)(accdb);
    expect((await stat(accdb)).mtimeMs).toBe(before); // the original is not touched
    const office = legacy.tables.Office!;
    expect(office.rows).toHaveLength(2);
    expect(office.columns.find((c) => c.name === 'Date of Detection')?.type).toBe(8);
    expect(office.rows[0]).toMatchObject({
      'Name of Accused': NAME_SI,
      'Name of Court': COURT_SI,
      'Date of Detection': '2026-01-02T00:00:00',
      'T/R': true,
      result: 1500.5,
      picture: 'scene.png',
    });
    expect(office.rows[1]!['NIC No of Accused']).toBeNull();
    expect(legacy.attachments).toHaveLength(1);
    expect(await readFile(legacy.attachments[0]!.path, 'utf8')).toBe('not-really-a-png');
  }, 120_000);

  it('imports it end to end', async (ctx) => {
    if (!engine) return ctx.skip();
    const repos = createMemoryRepositories();
    const svc = new DefaultImportService({
      read: accessReader(join(tmp, 'work2'), SCRIPT),
      references: repos.references,
      crs: repos.crs,
      cases: repos.cases,
      files: repos.files,
      audit: repos.audit,
      filesDir: join(tmp, 'files'),
      reportFile: join(tmp, 'report.json'),
      session: (): Session => ({
        userId: 'u',
        username: 'oic',
        role: 'oic',
        mustChangePassword: false,
      }),
    });
    const r = await svc.run(accdb);
    expect(r).toMatchObject({ rowsRead: 2, imported: 2, skipped: 0, picturesCopied: 1 });
    expect(r.exceptions).toEqual([]);
    expect(r.totals).toMatchObject({ crs: 2, finesByYear: { '2026': 150050 } });
    expect(r.lookupRows).toEqual({ 'Table offence': 2 });
    const crs = [...repos.store.crs.values()];
    expect(crs.map((c) => c.accused.name).sort()).toEqual([NAME_SI, 'Second Accused'].sort());
    const first = crs.find((c) => c.crNumber === '1/2026')!;
    expect(repos.store.cases.get(first.id)).toMatchObject({
      caseType: 'trial',
      courtDate: '2026-01-10',
    });
  }, 120_000);
});
