// The repository contract (packages/shared/contract), run against the in-memory mocks the
// services were built on, the SQLite repositories, and (A15 spike, when EXCISE_PG_URL is set by
// `pnpm db:pg-spike`) the same repositories on PostgreSQL. Whatever the services relied on in
// the mocks must hold on every real database.
import {
  createMemoryRepositories,
  sampleCaseInput,
  sampleCrInput,
  seedSampleReferences as seedRefs,
} from '@excise/mocks';
import { afterAll, describe, expect, it } from 'vitest';
import { createRepositories, createSqliteRepositories, openDatabase } from '@excise/db';
import { openPostgres, type PgDb } from '@excise/db/postgres-spike/pg-db.ts';

const PG_URL = process.env.EXCISE_PG_URL;
const pgDbs: PgDb[] = [];
afterAll(async () => {
  for (const db of pgDbs) await db.close();
});

const IMPLEMENTATIONS: Record<
  string,
  () => Promise<ReturnType<typeof createMemoryRepositories> | ReturnType<typeof createRepositories>>
> = {
  memory: async () => createMemoryRepositories(),
  sqlite: async () => createSqliteRepositories(openDatabase(':memory:')),
  ...(PG_URL
    ? {
        postgres: async () => {
          const db = await openPostgres(PG_URL, `t_${crypto.randomUUID().replace(/-/g, '')}`);
          pgDbs.push(db);
          return createRepositories(db);
        },
      }
    : {}),
};

for (const [name, make] of Object.entries(IMPLEMENTATIONS)) {
  describe(`repository contract: ${name}`, () => {
    async function setup() {
      const repos = await make();
      const refs = await seedRefs(repos.references);
      return { repos, refs };
    }

    it('CR: insert and read back every field', async () => {
      const { repos, refs } = await setup();
      const supportA = await repos.references.insert('support_officer', { value: 'Support A' });
      const supportB = await repos.references.insert('support_officer', { value: 'Support B' });
      const input = sampleCrInput(refs, {
        place: 'කොච්චිකඩේ',
        accused: {
          name: 'ඒ. බී. කුමාර',
          address: 'No 1',
          nic: '851234567V',
          age: 41,
          sex: 'male',
          phone: '077',
        },
        surety: { name: 'Surety', nic: '199012345678' },
        times: { arrival: '14.45', detection: '15:10' },
        supportOfficers: [
          { officerId: supportA.id, position: 1 },
          { officerId: supportB.id, position: 7 },
        ],
        seizedItems: [
          { itemType: 'spirit', quantity: 3.5, unit: 'L' },
          { itemType: 'cannabis', quantity: 20, unit: 'g', overQuantity: 2 },
        ],
        cashNotes: [
          { kind: 'used', denomination: 1000, text: 'S/426 672487' },
          { kind: 'left', denomination: 500, text: 'X/1' },
        ],
        productions: ['Bottle 1', 'Bottle 2'],
        quantity: 3500,
        quantityExtra: 10,
        notes: 'note',
      });
      const saved = await repos.crs.insert(input);
      expect(saved).toMatchObject({ ...input, version: 1, deleted: false });
      expect(await repos.crs.getById(saved.id)).toEqual(saved);
    });

    it('CR: optimistic locking, live-only number look-up, soft delete bumps version', async () => {
      const { repos, refs } = await setup();
      const cr = await repos.crs.insert(sampleCrInput(refs));
      const v2 = await repos.crs.update(cr.id, 1, sampleCrInput(refs, { place: 'Changed' }));
      expect(v2).toMatchObject({ version: 2, place: 'Changed' });
      expect(await repos.crs.update(cr.id, 1, sampleCrInput(refs))).toBeNull();

      expect((await repos.crs.findByNumber(refs.office, 2026, '1/2026'))?.id).toBe(cr.id);
      const before = (await repos.crs.getById(cr.id))!;
      await new Promise((r) => setTimeout(r, 5));
      await repos.crs.setDeleted(cr.id, true);
      const deleted = (await repos.crs.getById(cr.id))!;
      expect(deleted).toMatchObject({ deleted: true, version: before.version + 1 });
      expect(deleted.updatedAt > before.updatedAt).toBe(true);
      expect(await repos.crs.findByNumber(refs.office, 2026, '1/2026')).toBeNull();
      // The number of a deleted CR can be used again.
      const again = await repos.crs.insert(sampleCrInput(refs));
      expect((await repos.crs.findByNumber(refs.office, 2026, '1/2026'))?.id).toBe(again.id);
    });

    it('case: first save, update by version, clash, full read-back', async () => {
      const { repos, refs } = await setup();
      const cr = await repos.crs.insert(sampleCrInput(refs));
      const input = sampleCaseInput(cr.id, refs, {
        hearings: [
          { kind: 'summons', date: '2026-01-11' },
          { kind: 'trial', date: '2026-02-01', memo: 'postponed' },
        ],
        outcomes: [
          {
            outcomeType: 'fine',
            fineAmount: 500000,
            convictedDate: '2026-02-01',
            receiptNo: 'R1',
            addToConvictRegister: true,
          },
          { outcomeType: 'imprisonment', prisonMonths: 6, addToConvictRegister: true },
        ],
        rewardVoucherReceived: true,
        rewardVoucherDate: '2026-03-01',
        register: { volumeNo: '3', indexSn: '12' },
        handover: { officer: 'SI Silva', date: '2026-03-02' },
      });
      const first = await repos.cases.save(input, null);
      expect(first).toMatchObject({ ...input, version: 1 });
      expect(await repos.cases.save(input, null)).toBeNull();
      const second = await repos.cases.save({ ...input, caseType: 'warrant' }, 1);
      expect(second).toMatchObject({ version: 2, caseType: 'warrant' });
      expect(await repos.cases.save(input, 1)).toBeNull();
      expect(await repos.cases.getByCrimeReport(cr.id)).toEqual(second);
    });

    it('search: every filter, partial names, wildcards taken literally, deleted CRs hidden', async () => {
      const { repos, refs } = await setup();
      const a = await repos.crs.insert(sampleCrInput(refs));
      const b = await repos.crs.insert(
        sampleCrInput(refs, {
          crNumber: '2/2026',
          detectionDate: '2026-01-05',
          accused: { name: 'Other Person', nic: '199012345678' },
        }),
      );
      await repos.cases.save(sampleCaseInput(a.id, refs), null);
      const ids = async (f: Parameters<typeof repos.queries.search>[0]) =>
        (await repos.queries.search(f)).map((r) => r.crNumber).sort();

      expect(await ids({ kind: 'year', officeId: refs.office, year: 2026 })).toEqual([
        '1/2026',
        '2/2026',
      ]);
      expect(
        await ids({ kind: 'detection_date', officeId: refs.office, date: '2026-01-05' }),
      ).toEqual(['2/2026']);
      expect(await ids({ kind: 'court_date', officeId: refs.office, date: '2026-01-10' })).toEqual([
        '1/2026',
      ]);
      expect(
        await ids({ kind: 'court_case', courtId: refs.court, caseNumber: 'B/101/26' }),
      ).toEqual(['1/2026']);
      expect(await ids({ kind: 'name_nic', name: 'SAMPLE' })).toEqual(['1/2026']);
      expect(await ids({ kind: 'name_nic', nic: '199012345678' })).toEqual(['2/2026']);
      expect(await ids({ kind: 'name_nic', name: '%' })).toEqual([]);
      const row = (await repos.queries.search({ kind: 'name_nic', name: 'sample' }))[0]!;
      expect(row).toMatchObject({
        officeName: 'Negombo',
        offenceCode: 'PUDS',
        courtName: 'Negombo Magistrate Court',
        caseNumber: 'B/101/26',
        accusedNic: '851234567V',
      });
      await repos.crs.setDeleted(b.id, true);
      expect(await ids({ kind: 'year', officeId: refs.office, year: 2026 })).toEqual(['1/2026']);
    });

    it('convicts register: only marked outcomes, with fine and prison details', async () => {
      const { repos, refs } = await setup();
      const a = await repos.crs.insert(sampleCrInput(refs));
      const b = await repos.crs.insert(sampleCrInput(refs, { crNumber: '2/2026', month: 2 }));
      await repos.cases.save(
        sampleCaseInput(a.id, refs, {
          outcomes: [
            {
              outcomeType: 'fine',
              fineAmount: 250000,
              convictedDate: '2026-01-20',
              addToConvictRegister: true,
            },
            {
              outcomeType: 'imprisonment',
              prisonMonths: 3,
              prisonDays: 10,
              addToConvictRegister: true,
            },
          ],
        }),
        null,
      );
      await repos.cases.save(
        sampleCaseInput(b.id, refs, {
          outcomes: [{ outcomeType: 'fine', fineAmount: 1, addToConvictRegister: false }],
        }),
        null,
      );
      const rows = await repos.queries.convicts({ officeId: refs.office, year: 2026 });
      expect(rows).toEqual([
        {
          crimeReportId: a.id,
          crNumber: '1/2026',
          officeId: refs.office,
          accusedName: 'Sample Accused',
          accusedAddress: 'No 1, Negombo',
          accusedNic: '851234567V',
          offenceCode: 'PUDS',
          offenceName: 'Illegal spirit possession',
          quantity: 3500,
          courtId: refs.court,
          courtName: 'Negombo Magistrate Court',
          caseNumber: 'B/101/26',
          convictedDate: '2026-01-20',
          outcomes: ['fine', 'imprisonment'],
          fineAmount: 250000,
          prisonMonths: 3,
          prisonDays: 10,
        },
      ]);
      expect(await repos.queries.convicts({ month: 2 })).toEqual([]);
      expect(await repos.queries.convicts({ name: 'sample', courtId: refs.otherCourt })).toEqual(
        [],
      );
    });

    it('report rows: scope, names, fine sum, outcomes, seized items; deleted CRs left out', async () => {
      const { repos, refs } = await setup();
      const a = await repos.crs.insert(sampleCrInput(refs));
      const b = await repos.crs.insert(
        sampleCrInput(refs, { crNumber: '2/2026', month: 8, halfYear: 'second' }),
      );
      const c = await repos.crs.insert(sampleCrInput(refs, { crNumber: '3/2026' }));
      await repos.crs.setDeleted(c.id, true);
      await repos.cases.save(
        sampleCaseInput(a.id, refs, {
          caseNumber: '  ',
          outcomes: [
            { outcomeType: 'fine', fineAmount: 100, addToConvictRegister: false },
            {
              outcomeType: 'fine',
              fineAmount: 250,
              convictedDate: '2026-02-02',
              addToConvictRegister: true,
            },
          ],
        }),
        null,
      );
      const year = await repos.reportRows.rowsFor({
        kind: 'year',
        officeId: refs.office,
        year: 2026,
      });
      expect(year.map((r) => r.crNumber).sort()).toEqual(['1/2026', '2/2026']);
      const ra = year.find((r) => r.crimeReportId === a.id)!;
      expect(ra).toMatchObject({
        offenceCode: 'PUDS',
        detectingOfficerName: 'Officer One',
        informantName: 'Officer Two',
        courtName: 'Negombo Magistrate Court',
        caseNumber: null,
        caseType: 'trial',
        fineAmount: 350,
        convictedDate: '2026-02-02',
        outcomes: ['fine', 'fine'],
        addToConvictRegister: true,
        quantity: 3500,
        seized: [{ itemType: 'spirit', quantity: 3.5 }],
      });
      const rb = year.find((r) => r.crimeReportId === b.id)!;
      expect(rb).toMatchObject({ caseType: null, fineAmount: null, outcomes: [], courtName: null });
      expect(
        (
          await repos.reportRows.rowsFor({
            kind: 'half_year',
            officeId: refs.office,
            year: 2026,
            half: 'second',
          })
        ).map((r) => r.crimeReportId),
      ).toEqual([b.id]);
      expect(
        await repos.reportRows.rowsFor({
          kind: 'month',
          officeId: refs.office,
          year: 2026,
          month: 3,
        }),
      ).toEqual([]);
    });

    it('users and the audit log', async () => {
      const { repos } = await setup();
      expect(await repos.users.count()).toBe(0);
      const u = await repos.users.create({
        username: 'oic',
        passwordHash: 'h',
        role: 'oic',
        active: true,
        mustChangePassword: true,
      });
      expect(u).toMatchObject({ failedAttempts: 0, mustChangePassword: true });
      await repos.users.setFailedAttempts(u.id, 3);
      await repos.users.setPasswordHash(u.id, 'h2', false);
      await repos.users.setActive(u.id, false);
      expect(await repos.users.findByUsername('oic')).toMatchObject({
        passwordHash: 'h2',
        failedAttempts: 3,
        active: false,
        mustChangePassword: false,
      });
      expect(await repos.users.list()).toHaveLength(1);

      const entry = {
        before: { a: 1 },
        after: { a: 2 },
        table: 'crime_reports' as const,
        rowId: 'r1',
      };
      await repos.audit.record({ ...entry, userId: u.id, action: 'update' });
      await repos.audit.record({
        ...entry,
        userId: null,
        action: 'login_failed',
        table: 'users',
        rowId: null,
      });
      const all = await repos.auditQuery.search({});
      expect(all.map((e) => e.action)).toEqual(['login_failed', 'update']);
      expect(all[1]).toMatchObject({ username: 'oic', before: { a: 1 }, after: { a: 2 } });
      expect(
        await repos.auditQuery.search({ table: 'crime_reports', rowId: 'r1', userId: u.id }),
      ).toHaveLength(1);
      expect(await repos.auditQuery.search({ to: '2000-01-01' })).toEqual([]);
    });

    it('reference lists: per kind, rename keeps the id, usage counts deleted CRs too', async () => {
      const { repos, refs } = await setup();
      expect((await repos.references.list('court', false)).map((i) => i.value)).toEqual([
        'Colombo Magistrate Court',
        'Negombo Magistrate Court',
      ]);
      expect(
        await repos.references.findByValue('detecting_officer', 'officer three'),
      ).toMatchObject({ id: refs.otherOfficer });
      expect(await repos.references.findByValue('informant', 'Officer Three')).toBeNull();
      const driver = await repos.references.insert(
        'driver',
        { value: 'Driver', rank: 'EG' },
        false,
      );
      expect(driver).toMatchObject({ kind: 'driver', rank: 'EG', active: false, code: null });
      expect(await repos.references.list('driver', false)).toEqual([]);
      await repos.references.update(refs.offencePuds, { value: 'ස්ප්‍රීතු', code: 'PUDS' });
      expect(await repos.refs.offence(refs.offencePuds)).toEqual({
        code: 'PUDS',
        nameSi: 'ස්ප්‍රීතු',
      });

      const support = await repos.references.insert('support_officer', { value: 'Support' });
      const cr = await repos.crs.insert(
        sampleCrInput(refs, { supportOfficers: [{ officerId: support.id, position: 2 }] }),
      );
      await repos.cases.save(sampleCaseInput(cr.id, refs), null);
      for (const id of [
        refs.office,
        refs.offencePuds,
        support.id,
        refs.court,
        refs.prosecutor,
      ]) {
        expect(await repos.references.usageCount(id), id).toBe(1);
      }
      expect(await repos.references.usageCount(refs.otherCourt)).toBe(0);
      await repos.crs.setDeleted(cr.id, true);
      expect(await repos.references.usageCount(refs.court)).toBe(1);
      await repos.references.delete(refs.otherCourt);
      expect(await repos.references.getById(refs.otherCourt)).toBeNull();
    });

    it('file links', async () => {
      const { repos, refs } = await setup();
      const cr = await repos.crs.insert(sampleCrInput(refs));
      const f = {
        id: crypto.randomUUID(),
        crimeReportId: cr.id,
        originalName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 3,
        createdAt: new Date().toISOString(),
      };
      await repos.files.insert({ ...f, storedName: `${f.id}.png` });
      expect(await repos.files.listFor(cr.id)).toEqual([f]);
      expect(await repos.files.get(f.id)).toEqual({ ...f, storedName: `${f.id}.png` });
      await repos.files.setDeleted(f.id);
      expect(await repos.files.listFor(cr.id)).toEqual([]);
      expect(await repos.files.get(f.id)).toBeNull();
      expect(await repos.files.liveStoredNames()).toEqual(new Set());
    });
  });
}
