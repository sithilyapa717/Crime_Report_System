import type { Session } from '@excise/contract';
import {
  createMemoryRepositories,
  sampleCaseInput,
  sampleCrInput,
  seedReferences,
} from '@excise/mocks';
import { describe, expect, it } from 'vitest';
import { DefaultSearchService, SearchInputError } from './index.js';

const session = (): Session => ({ userId: 'u', username: 'u', role: 'observation' });

async function setup() {
  const repos = createMemoryRepositories();
  const refs = seedReferences(repos.store);
  const a = await repos.crs.insert(sampleCrInput(refs, { crNumber: '10/2026' }));
  const b = await repos.crs.insert(
    sampleCrInput(refs, {
      crNumber: '2/2026',
      detectionDate: '2026-02-01',
      accused: { name: 'Kamal Perera', nic: '199012345678' },
    }),
  );
  await repos.cases.save(
    sampleCaseInput(a.id, refs, {
      outcomes: [
        {
          outcomeType: 'fine',
          fineAmount: 1000000,
          convictedDate: '2026-01-20',
          addToConvictRegister: true,
        },
      ],
    }),
    null,
  );
  await repos.cases.save(
    sampleCaseInput(b.id, refs, { courtId: refs.otherCourt, caseNumber: 'C/5' }),
    null,
  );
  return { svc: new DefaultSearchService(repos.queries, session), refs };
}

describe('SearchService', () => {
  it('lists a year in running-number order', async () => {
    const { svc, refs } = await setup();
    const rows = await svc.crimeReports({ kind: 'year', officeId: refs.office, year: 2026 });
    expect(rows.map((r) => r.crNumber)).toEqual(['2/2026', '10/2026']);
  });

  it('finds by partial name and normalises NIC case', async () => {
    const { svc } = await setup();
    expect(await svc.crimeReports({ kind: 'name_nic', name: '  kamal ' })).toHaveLength(1);
    expect(await svc.crimeReports({ kind: 'name_nic', nic: '851234567v' })).toHaveLength(1);
  });

  it('finds by court and case number', async () => {
    const { svc, refs } = await setup();
    const rows = await svc.crimeReports({
      kind: 'court_case',
      courtId: refs.otherCourt,
      caseNumber: ' C/5 ',
    });
    expect(rows.map((r) => r.crNumber)).toEqual(['2/2026']);
  });

  it('rejects empty or malformed input', async () => {
    const { svc } = await setup();
    await expect(svc.crimeReports({ kind: 'name_nic' })).rejects.toBeInstanceOf(SearchInputError);
    await expect(svc.previousOffences({ nic: '123' })).rejects.toBeInstanceOf(SearchInputError);
    await expect(
      svc.crimeReports({ kind: 'detection_date', officeId: 'x', date: '2026.01.02' }),
    ).rejects.toBeInstanceOf(SearchInputError);
  });

  it('previous offences only return people in the convicts register', async () => {
    const { svc, refs } = await setup();
    expect(await svc.previousOffences({ name: 'sample' })).toHaveLength(1);
    expect(await svc.previousOffences({ name: 'kamal' })).toHaveLength(0);
    expect(await svc.previousOffences({ name: 'sample', courtId: refs.otherCourt })).toHaveLength(
      0,
    );
  });
});
