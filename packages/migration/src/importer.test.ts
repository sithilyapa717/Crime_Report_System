import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Session } from '@excise/contract';
import { createMemoryRepositories } from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DefaultImportService } from './importer.js';
import type { LegacyDatabase, LegacyTable } from './reader/index.js';

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'excise-import-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

/** One legacy `Office` row, with the old column names. */
function officeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ID: 1,
    'CR NO 2017': '1/2026',
    YearCR: 2026,
    snocr: 1,
    office: 'මීගමුව',
    month: 'January',
    fistsecon: 'පළමු අඩවසර',
    'Date of Detection': '2026-01-02T00:00:00',
    'Place of Detection': 'කොච්චිකඩේ',
    Offence: 'PUDS',
    'polise unit': 'Kochchikade',
    'detection officer': 'IP Perera',
    Informan: 'SI Silva',
    dh1: 'PC Fernando',
    inh2: 'PC Jayasuriya',
    'Name of Accused': 'ඒ. බී. කුමාර',
    'Address of Accused': 'No 1, Negombo',
    'NIC No of Accused': '851234567v',
    Age: 41,
    'male female': 'පුරුෂ',
    'Time of Detection': '14.45',
    'Cash 1000': 'S/426 672487',
    'Cash2 1000': 'S/426 672488',
    sp1: 3.5,
    sp9: '20',
    Quantity: 3500,
    'Production list': 'Bottle 1',
    'Name of Court': 'මීගමුව මහේස්ත්‍රාත් අධිකරණය',
    'Date of Court': '2026.01.10',
    'court officer': 'SI Silva',
    'Case no': 'B/101/26',
    'T/R': true,
    WT: false,
    calling: false,
    result: '5,000',
    'fine date': '2026.01.20',
    cell: true,
    celldatem: 6,
    type: true,
    'T/R date': '2026.02.01',
    'T/R date m': 'postponed',
    rewardgive: false,
    'volum no': '3',
    picture: 'scene.png',
    'Mystery column': 'x',
    ...over,
  };
}

function table(rows: Record<string, unknown>[], extraColumns: string[] = []): LegacyTable {
  const names = [...new Set([...rows.flatMap((r) => Object.keys(r)), ...extraColumns])];
  return {
    columns: names.map((name) => ({ name, type: name === 'Date of Detection' ? 8 : 10 })),
    rows,
  };
}

async function setup(rows: Record<string, unknown>[], role: Role = 'oic') {
  const repos = createMemoryRepositories();
  const picture = join(tmp, 'att-1-0-1-scene.png');
  await writeFile(picture, 'png-bytes');
  const legacy: LegacyDatabase = {
    tables: {
      Office: table(rows),
      'Table offence': {
        columns: [
          { name: 'ID', type: 4 },
          { name: 'Offence', type: 10 },
          { name: 'Offence name', type: 10 },
        ],
        rows: [
          { ID: 1, Offence: 'PUDS', 'Offence name': 'අනවසර ස්ප්‍රීතු ළඟ තබා ගැනීම' },
          { ID: 2, Offence: 'UPG', 'Offence name': 'ගංජා ළඟ තබා ගැනීම' },
        ],
      },
      'Table court': table([{ ID: 1, court: 'මීගමුව මහේස්ත්‍රාත් අධිකරණය' }]),
      login: table([{ password: 'secret' }]),
    },
    attachments: [
      { table: 'Office', row: 0, field: 'picture', fileName: 'scene.png', path: picture },
    ],
  };
  const svc = new DefaultImportService({
    read: async () => legacy,
    references: repos.references,
    crs: repos.crs,
    cases: repos.cases,
    files: repos.files,
    audit: repos.audit,
    filesDir: join(tmp, 'files'),
    reportFile: join(tmp, 'import-report.json'),
    session: (): Session => ({ userId: 'u', username: 'oic', role, mustChangePassword: false }),
  });
  return { repos, svc };
}

describe('Access import', () => {
  it('dry run reports everything and writes nothing', async () => {
    const { repos, svc } = await setup([
      officeRow(),
      officeRow({ 'CR NO 2017': '2/2026', result: null }),
    ]);
    const r = await svc.dryRun('C:\\data\\old.accdb');
    expect(r).toMatchObject({ mode: 'dry_run', rowsRead: 2, imported: 2, skipped: 0 });
    expect(repos.store.crs.size).toBe(0);
    expect(repos.store.refs.size).toBe(0);
    expect(r.totals).toEqual({
      crs: 2,
      crsByYear: { '2026': 2 },
      finesByYear: { '2026': 500000 },
      quantityByOffence: { PUDS: 7000 },
    });
    // Offence and court come from the lookup tables; officers and the office do not.
    expect(r.unverifiedRefs.map((u) => u.kind).sort()).toEqual([
      'detecting_officer',
      'informant',
      'office',
      'police_area',
      'prosecuting_officer',
      'support_officer',
      'support_officer',
    ]);
    expect(r.columns.unmapped).toEqual(['Mystery column']);
    expect(r.columns.missing).toContain('Hight');
    expect(r.lookupRows).toMatchObject({
      'Table offence': 2,
      'Table court': 1,
      'login (not imported: passwords are never migrated)': 1,
    });
    expect(JSON.stringify(r)).not.toContain('secret');
    expect(await svc.lastReport()).toEqual(r);
  });

  it('a real run saves CRs, cases, pictures and reference items; a second run adds nothing', async () => {
    const { repos, svc } = await setup([officeRow()]);
    const r = await svc.run('C:\\data\\old.accdb');
    expect(r).toMatchObject({ mode: 'run', imported: 1, picturesCopied: 1 });
    expect(r.exceptions).toEqual([]);

    const [cr] = [...repos.store.crs.values()];
    expect(cr).toMatchObject({
      crNumber: '1/2026',
      crYear: 2026,
      month: 1,
      halfYear: 'first',
      detectionDate: '2026-01-02',
      quantity: 3500,
      accused: { name: 'ඒ. බී. කුමාර', nic: '851234567V', age: 41, sex: 'male' },
      times: { detection: '14.45' },
      productions: ['Bottle 1'],
    });
    expect(cr!.seizedItems).toEqual([
      { itemType: 'spirit', quantity: 3.5, unit: 'L' },
      { itemType: 'cannabis', quantity: 20, unit: 'g' },
    ]);
    expect(cr!.cashNotes).toEqual([
      { kind: 'used', denomination: 1000, text: 'S/426 672487' },
      { kind: 'left', denomination: 1000, text: 'S/426 672488' },
    ]);
    expect(cr!.supportOfficers.map((s) => s.position)).toEqual([1, 7]);
    expect(await repos.refs.name(cr!.detectingOfficerId!)).toBe('IP Perera');

    const c = repos.store.cases.get(cr!.id)!;
    expect(c).toMatchObject({
      caseNumber: 'B/101/26',
      caseType: 'trial',
      courtDate: '2026-01-10',
      register: { volumeNo: '3' },
      hearings: [{ kind: 'trial', date: '2026-02-01', memo: 'postponed' }],
    });
    expect(c.outcomes).toEqual([
      expect.objectContaining({
        outcomeType: 'fine',
        fineAmount: 500000,
        convictedDate: '2026-01-20',
        addToConvictRegister: true,
      }),
      expect.objectContaining({
        outcomeType: 'imprisonment',
        prisonMonths: 6,
        addToConvictRegister: true,
      }),
    ]);
    // The prosecutor and the informant are different lists, so the same name is two items.
    const items = [...repos.store.refs.values()];
    expect(
      items
        .filter((i) => i.name === 'SI Silva')
        .map((i) => i.kind)
        .sort(),
    ).toEqual(['informant', 'prosecuting_officer']);
    expect(items.find((i) => i.code === 'PUDS')).toMatchObject({ active: true });
    expect(items.find((i) => i.name === 'IP Perera')).toMatchObject({ active: false });

    expect(await readdir(join(tmp, 'files'))).toHaveLength(1);
    expect(repos.store.audit.at(-1)).toMatchObject({ action: 'import', after: { imported: 1 } });

    const again = await svc.run('C:\\data\\old.accdb');
    expect(again.imported).toBe(0);
    expect(again.exceptions).toEqual([
      { row: '1/2026', column: 'CR NO 2017', value: '1/2026', reason: 'duplicate_cr' },
    ]);
    expect(repos.store.crs.size).toBe(1);
  });

  it('unreadable values go to the exceptions report and are kept in the notes, never guessed', async () => {
    const { repos, svc } = await setup([
      officeRow({
        'NIC No of Accused': '12345',
        'Date of Court': '02.03.2026',
        sp1: '3 bottles',
        WT: true,
        'Bottle type': 'arrack 750',
      }),
    ]);
    const r = await svc.run('x.accdb');
    expect(r.exceptions.map((e) => [e.column, e.reason])).toEqual([
      ['NIC No of Accused', 'bad_nic'],
      ['sp1', 'bad_number'],
      ['T/R + WT', 'other'],
      ['Date of Court', 'bad_date'],
    ]);
    const [cr] = [...repos.store.crs.values()];
    expect(cr!.accused.nic).toBeUndefined();
    expect(cr!.notes).toContain('NIC No of Accused: 12345');
    expect(cr!.notes).toContain('Date of Court: 02.03.2026');
    expect(cr!.notes).toContain('Bottle type: arrack 750');
    expect(repos.store.cases.get(cr!.id)!.caseType).toBeUndefined();
    expect(r.columns.notStored).toEqual({ 'Bottle type': 1 });
  });

  it('skips rows without the required values and says why', async () => {
    const { svc } = await setup([
      officeRow({ 'CR NO 2017': '3/2026', 'Date of Detection': null }),
      officeRow({ 'CR NO 2017': 'abc' }),
      officeRow({ 'CR NO 2017': '5/2026', 'Name of Court': null }),
      officeRow({ 'CR NO 2017': '5/2026' }),
    ]);
    const r = await svc.dryRun('x.accdb');
    expect(r).toMatchObject({ rowsRead: 4, imported: 1, skipped: 3 });
    expect(r.exceptions).toEqual(
      expect.arrayContaining([
        { row: '3/2026', column: 'Date of Detection', value: '', reason: 'missing_required' },
        { row: 'abc', column: 'CR NO 2017', value: 'abc', reason: 'bad_cr_number' },
        { row: '5/2026', column: 'Name of Court', value: '', reason: 'missing_required' },
        { row: '5/2026', column: 'CR NO 2017', value: '5/2026', reason: 'duplicate_cr' },
      ]),
    );
  });

  it('is for the OIC only', async () => {
    const { svc } = await setup([officeRow()], 'detecting');
    await expect(svc.dryRun('x.accdb')).rejects.toThrow(/lacks permission/);
  });
});
