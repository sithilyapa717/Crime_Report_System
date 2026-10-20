// A6 load test (packages/db): 100,000 CRs (about 12,500 a year over 8 years), then every search and report
// must answer in about a second. Slow, so it only runs with `pnpm db:load-test`.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultReportService } from '@excise/reports';
import { DefaultSearchService } from '@excise/search';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSqliteRepositories,
  openDatabase,
  seedDemo,
  type SqliteRepositories,
} from '@excise/db';
import type { DemoRefs } from '@excise/db';

const RUN = process.env.EXCISE_LOAD_TEST === '1';
const COUNT = Number(process.env.EXCISE_LOAD_COUNT ?? 100_000);
const LIMIT_MS = 1000;
const YEAR = 2026;

let tmp = '';
let repos: SqliteRepositories;
let refs: DemoRefs;
const timings: [string, number, number][] = [];

async function timed<T extends unknown[] | object>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  const result = await fn();
  const ms = performance.now() - t;
  timings.push([name, Math.round(ms), Array.isArray(result) ? result.length : 1]);
  expect(ms, `${name} took ${Math.round(ms)} ms`).toBeLessThan(LIMIT_MS);
  return result;
}

describe.skipIf(!RUN)(`load test: ${COUNT} CRs`, () => {
  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'excise-load-'));
    repos = createSqliteRepositories(openDatabase(join(tmp, 'load.sqlite')));
    const t = performance.now();
    refs = seedDemo(repos.db, COUNT, { year: YEAR });
    console.log(`seeded ${COUNT} CRs in ${Math.round(performance.now() - t)} ms`);
  }, 600_000);

  afterAll(async () => {
    console.table(timings.map(([what, ms, rows]) => ({ what, ms, rows })));
    await repos?.db.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('searches', async () => {
    const s = (f: Parameters<typeof repos.queries.search>[0]) => repos.queries.search(f);
    const year = await timed('search by year', () =>
      s({ kind: 'year', officeId: refs.office, year: YEAR }),
    );
    expect(year.length).toBeGreaterThan(10_000);
    const one = year[123]!;
    await timed('search by detection date', () =>
      s({ kind: 'detection_date', officeId: refs.office, date: one.detectionDate }),
    );
    await timed('search by court date', () =>
      s({ kind: 'court_date', officeId: refs.office, date: `${YEAR}-03-10` }),
    );
    await timed('search by name (partial)', () => s({ kind: 'name_nic', name: 'accused 9999' }));
    await timed('search by NIC', () => s({ kind: 'name_nic', nic: one.accusedNic ?? '' }));
    await timed('search by court + case', () =>
      s({
        kind: 'court_case',
        courtId: refs.courts[0]!,
        caseNumber: `B/1/${String(YEAR).slice(2)}`,
      }),
    );
    await timed('convicts register (year)', () =>
      repos.queries.convicts({ officeId: refs.office, year: YEAR }),
    );
    await timed('previous offences (name)', () =>
      repos.queries.convicts({ name: 'Demo Accused 4242' }),
    );
  }, 120_000);

  it('reports through the report service', async () => {
    const session = () => ({
      userId: 'u',
      username: 'u',
      role: 'oic' as const,
      mustChangePassword: false,
    });
    const reports = new DefaultReportService(repos.reportRows, session, (k) => k);
    const search = new DefaultSearchService(repos.queries, session);
    const scope = { kind: 'year' as const, officeId: refs.office, year: YEAR };
    for (const type of ['register', 'fines_earned', 'convicts', 'not_filed'] as const) {
      await timed(`yearly report: ${type}`, () =>
        reports.run({ scope, person: { kind: 'none' }, type }),
      );
    }
    await timed('monthly report: register', () =>
      reports.run({
        scope: { ...scope, kind: 'month', month: 3 },
        person: { kind: 'none' },
        type: 'register',
      }),
    );
    await timed('half-year by officer', () =>
      reports.run({
        scope: { kind: 'half_year', officeId: refs.office, year: YEAR, half: 'first' },
        person: { kind: 'detecting_officer', officerId: refs.officers[0]! },
        type: 'register',
      }),
    );
    await timed('yearly summary by offence', () =>
      reports.summary({ scope, person: { kind: 'none' }, type: 'register' }, 'offence'),
    );
    await timed('previous-offence check (service)', () =>
      search.previousOffences({ name: 'Demo Accused 77' }),
    );
  }, 120_000);
});
