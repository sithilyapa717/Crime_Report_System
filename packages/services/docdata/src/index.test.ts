import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Session } from '@excise/contract';
import {
  createMemoryRepositories,
  sampleCaseInput,
  sampleCrInput,
  seedReferences,
} from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import { DefaultDocDataService, formatMoney } from './index.js';

const session = (role: Role) => (): Session => ({ userId: 'u', username: 'u', role });

/** Field names from D's generated catalogue (read-only here). */
function catalogueFields(): string[] {
  const md = readFileSync(
    fileURLToPath(new URL('../../../../docs/document-catalogue/MERGE_FIELDS.md', import.meta.url)),
    'utf8',
  );
  return [...md.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]!);
}

async function setup(role: Role = 'detecting') {
  const repos = createMemoryRepositories();
  const refs = seedReferences(repos.store);
  const support = repos.store.addRef({ name: 'Support Six' });
  const cr = await repos.crs.insert(
    sampleCrInput(refs, {
      supportOfficers: [
        { officerId: refs.otherOfficer, position: 1 },
        { officerId: support, position: 6 },
      ],
      cashNotes: [
        { kind: 'used', denomination: 1000, count: 2 },
        { kind: 'left', denomination: 500, count: 1 },
      ],
      times: { arrival: '09:15' },
      surety: { name: 'Surety One' },
    }),
  );
  await repos.cases.save(
    sampleCaseInput(cr.id, refs, {
      hearings: [{ kind: 'warrant', date: '2026-02-03' }],
      outcomes: [
        {
          outcomeType: 'fine',
          fineAmount: 1500050,
          convictedDate: '2026-01-20',
          addToConvictRegister: true,
        },
      ],
    }),
    null,
  );
  return { svc: new DefaultDocDataService(repos.crs, repos.cases, repos.refs, session(role)), cr };
}

describe('DocDataService', () => {
  it('provides every merge field used by the templates', async () => {
    const { svc, cr } = await setup();
    const data = await svc.buildFor(cr.id);
    const expected = catalogueFields();
    expect(expected.length).toBeGreaterThanOrEqual(60);
    expect(expected.filter((f) => !(f in data))).toEqual([]);
  });

  it('fills values in the old formats', async () => {
    const { svc, cr } = await setup();
    const d = await svc.buildFor(cr.id);
    expect(d).toMatchObject({
      CR_NO_2017: '1/2026',
      office: 'Negombo',
      Offence: 'PUDS',
      Date_of_Detection: '2026.01.02',
      Date_of_Court: '2026.01.10',
      WT_date: '2026.02.03',
      fine_date: '2026.01.20',
      result: '15,000.50',
      Name_of_Court: 'Negombo Magistrate Court',
      court_officer: 'Prosecutor One',
      detection_officer: 'Officer One',
      Informan: 'Officer Two',
      dh1: 'Officer Three',
      inh1: 'Support Six',
      dh2: '',
      Cash_1000: '2',
      Cash3_500: '1',
      Cash_100: '',
      Time_of_Arraival: '09:15',
      Name_of_Suerty: 'Surety One',
      Quantity: '3.5 L',
    });
  });

  it('needs the document permission', async () => {
    const { svc, cr } = await setup('observation');
    await expect(svc.buildFor(cr.id)).rejects.toThrow(/lacks permission/);
  });

  it('formats money', () => {
    expect(formatMoney(0)).toBe('0.00');
    expect(formatMoney(null)).toBe('');
  });
});
