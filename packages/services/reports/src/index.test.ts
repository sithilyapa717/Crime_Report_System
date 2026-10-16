import type { ReportParams, Session } from '@excise/contract';
import {
  createMemoryRepositories,
  sampleCaseInput,
  sampleCrInput,
  seedReferences,
} from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import { DefaultReportService } from './index.js';

const session = (role: Role) => (): Session => ({ userId: 'u', username: 'u', role });

async function setup(role: Role = 'oic') {
  const repos = createMemoryRepositories();
  const refs = seedReferences(repos.store);
  const add = async (n: number, month: number, extra = {}) =>
    repos.crs.insert(
      sampleCrInput(refs, {
        crNumber: `${n}/2026`,
        month,
        halfYear: month <= 6 ? 'first' : 'second',
        detectionDate: `2026-${String(month).padStart(2, '0')}-02`,
        ...extra,
      }),
    );

  // 1: not filed yet. 2: trial, fined, reward due. 3: warrant, no fine. 4: settled, no case no.
  // 5: July, other officer, cannabis, fined and voucher received. 6: deleted.
  await add(1, 1);
  const c2 = await add(2, 1);
  await repos.cases.save(
    sampleCaseInput(c2.id, refs, {
      outcomes: [
        {
          outcomeType: 'fine',
          fineAmount: 500000,
          convictedDate: '2026-01-20',
          addToConvictRegister: true,
        },
      ],
    }),
    null,
  );
  const c3 = await add(3, 2);
  await repos.cases.save(
    sampleCaseInput(c3.id, refs, { caseType: 'warrant', caseNumber: 'W/3' }),
    null,
  );
  const c4 = await add(4, 3);
  await repos.cases.save(
    sampleCaseInput(c4.id, refs, { caseNumber: undefined, caseType: undefined }),
    null,
  );
  repos.store.cases.set(c4.id, {
    ...repos.store.cases.get(c4.id)!,
    outcomes: [{ outcomeType: 'settlement', addToConvictRegister: false }],
  });
  const c5 = await add(5, 7, {
    offenceTypeId: refs.offenceUpg,
    detectingOfficerId: refs.otherOfficer,
    seizedItems: [{ itemType: 'cannabis', quantity: 250, unit: 'g' }],
  });
  await repos.cases.save(
    sampleCaseInput(c5.id, refs, {
      rewardVoucherReceived: true,
      outcomes: [
        { outcomeType: 'fine', fineAmount: 250000, addToConvictRegister: true },
        { outcomeType: 'imprisonment', prisonMonths: 6, addToConvictRegister: true },
      ],
    }),
    null,
  );
  const c6 = await add(6, 1);
  await repos.crs.setDeleted(c6.id, true);

  return { svc: new DefaultReportService(repos.reportRows, session(role)), refs };
}

const params = (
  refs: { office: string },
  type: ReportParams['type'],
  extra: Partial<ReportParams> = {},
): ReportParams => ({
  scope: { kind: 'year', officeId: refs.office, year: 2026 },
  person: { kind: 'none' },
  type,
  ...extra,
});

const numbers = (rows: Record<string, unknown>[]) => rows.map((r) => r.crNumber);

describe('ReportService', () => {
  it('register lists every live CR in running-number order', async () => {
    const { svc, refs } = await setup();
    const r = await svc.run(params(refs, 'register'));
    expect(numbers(r.rows)).toEqual(['1/2026', '2/2026', '3/2026', '4/2026', '5/2026']);
    expect(r.fineTotal).toBe(750000);
  });

  it('applies the old Access filters', async () => {
    const { svc, refs } = await setup();
    const run = async (t: ReportParams['type']) => numbers((await svc.run(params(refs, t))).rows);
    expect(await run('not_filed')).toEqual(['1/2026']);
    expect(await run('warrant')).toEqual(['3/2026']);
    expect(await run('trial')).toEqual(['2/2026', '5/2026']);
    expect(await run('fines_not_collected')).toEqual(['3/2026']);
    expect(await run('rewards_due')).toEqual(['2/2026']);
    expect(await run('fines_earned')).toEqual(['2/2026', '5/2026']);
    expect(await run('resolved')).toEqual(['2/2026', '4/2026', '5/2026']);
  });

  it('half-year uses the half chosen at entry, and month scope works', async () => {
    const { svc, refs } = await setup();
    const half = await svc.run(
      params(refs, 'register', {
        scope: { kind: 'half_year', officeId: refs.office, year: 2026, half: 'second' },
      }),
    );
    expect(numbers(half.rows)).toEqual(['5/2026']);
    const month = await svc.run(
      params(refs, 'register', {
        scope: { kind: 'month', officeId: refs.office, year: 2026, month: 1 },
      }),
    );
    expect(numbers(month.rows)).toEqual(['1/2026', '2/2026']);
  });

  it('filters by detecting officer', async () => {
    const { svc, refs } = await setup();
    const r = await svc.run(
      params(refs, 'register', {
        person: { kind: 'detecting_officer', officerId: refs.otherOfficer },
      }),
    );
    expect(numbers(r.rows)).toEqual(['5/2026']);
  });

  it('convicts list flags each sentence type', async () => {
    const { svc, refs } = await setup();
    const r = await svc.run(params(refs, 'convicts'));
    expect(r.columns.at(-1)?.key).toBe('accusedNic');
    const c5 = r.rows.find((x) => x.caseNumber === 'B/101/26' && x.imprisonment === 1);
    expect(c5?.fineAmount).toBe(250000);
    expect(c5?.probation).toBeNull();
  });

  it('summarises count, quantities and fines per offence', async () => {
    const { svc, refs } = await setup();
    const groups = await svc.summary(params(refs, 'register'), 'offence');
    const upg = groups.find((g) => g.key === 'UPG')!;
    const puds = groups.find((g) => g.key === 'PUDS')!;
    expect(upg).toMatchObject({ count: 1, fineTotal: 250000, quantities: { cannabis: 250 } });
    expect(puds).toMatchObject({ count: 4, fineTotal: 500000, quantities: { spirit: 14 } });
  });

  it('observation officers cannot run per-officer reports', async () => {
    const { svc, refs } = await setup('observation');
    await expect(svc.run(params(refs, 'register'))).resolves.toBeTruthy();
    await expect(
      svc.run(
        params(refs, 'register', { person: { kind: 'informant', officerId: refs.informant } }),
      ),
    ).rejects.toThrow(/lacks permission/);
  });
});
