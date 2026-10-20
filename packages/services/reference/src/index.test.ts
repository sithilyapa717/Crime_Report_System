import type { Session } from '@excise/contract';
import { createMemoryRepositories, sampleCrInput, seedReferences } from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import { DefaultReferenceService, ReferenceError } from './index.js';

const session =
  (role: Role): (() => Session) =>
  () => ({ userId: 'u', username: 'u', role, mustChangePassword: false });

function setup(role: Role = 'oic') {
  const repos = createMemoryRepositories();
  const refs = seedReferences(repos.store);
  const svc = new DefaultReferenceService(repos.references, session(role), repos.audit);
  return { repos, refs, svc };
}

describe('ReferenceService', () => {
  it('lists one kind, sorted, without inactive items unless asked', async () => {
    const { svc, refs } = setup();
    expect((await svc.list('court')).map((i) => i.value)).toEqual([
      'Colombo Magistrate Court',
      'Negombo Magistrate Court',
    ]);
    await svc.setActive(refs.otherCourt, false);
    expect((await svc.list('court')).map((i) => i.id)).toEqual([refs.court]);
    expect(await svc.list('court', { includeInactive: true })).toHaveLength(2);
  });

  it('every role may read lists, only the OIC may change them', async () => {
    const { svc } = setup('observation');
    await expect(svc.list('offence')).resolves.toHaveLength(2);
    await expect(svc.add('court', { value: 'Gampaha' })).rejects.toThrow(/lacks permission/);
    await expect(svc.list('court', { includeInactive: true })).rejects.toThrow(/lacks permission/);
  });

  it('adds with validation per list and audits', async () => {
    const { svc, repos } = setup();
    const added = await svc.add('offence', { value: 'Toddy sale', code: 'ust' });
    expect(added).toMatchObject({ kind: 'offence', code: 'UST', active: true, rank: null });
    await expect(svc.add('offence', { value: 'No code' })).rejects.toMatchObject({
      code: 'code_required',
    });
    await expect(svc.add('offence', { value: 'Other', code: 'PUDS' })).rejects.toMatchObject({
      code: 'duplicate_code',
    });
    await expect(svc.add('court', { value: 'negombo magistrate court' })).rejects.toMatchObject({
      code: 'duplicate',
    });
    await expect(svc.add('year', { value: '26' })).rejects.toMatchObject({ code: 'bad_year' });
    // Fields that do not belong to the list are dropped.
    const court = await svc.add('court', { value: 'Gampaha', code: 'X', rank: 'Y' });
    expect(court).toMatchObject({ code: null, rank: null });
    const officer = await svc.add('driver', { value: 'Driver One', rank: 'EG' });
    expect(officer.rank).toBe('EG');
    expect(repos.store.audit.map((e) => [e.table, e.action])).toEqual([
      ['reference_items', 'reference_add'],
      ['reference_items', 'reference_add'],
      ['reference_items', 'reference_add'],
    ]);
  });

  it('renames keep the id, so records show the new name', async () => {
    const { svc, refs, repos } = setup();
    await repos.crs.insert(sampleCrInput(refs));
    const renamed = await svc.rename(refs.detectingOfficer, { value: 'Officer One (IP)' });
    expect(renamed.id).toBe(refs.detectingOfficer);
    expect(await repos.refs.name(refs.detectingOfficer)).toBe('Officer One (IP)');
    await expect(svc.rename(refs.detectingOfficer, { value: 'Officer Three' })).rejects.toThrow(
      ReferenceError,
    );
  });

  it('cannot delete an item in use; can deactivate it instead', async () => {
    const { svc, refs, repos } = setup();
    await repos.crs.insert(sampleCrInput(refs));
    expect(await svc.usageCount(refs.offencePuds)).toBe(1);
    await expect(svc.remove(refs.offencePuds)).rejects.toMatchObject({ code: 'in_use' });
    await svc.setActive(refs.offencePuds, false);
    expect((await svc.list('offence')).map((i) => i.code)).toEqual(['UPG']);
    await svc.remove(refs.offenceUpg);
    expect(await repos.references.getById(refs.offenceUpg)).toBeNull();
  });
});
