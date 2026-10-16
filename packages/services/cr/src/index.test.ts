import type { Session } from '@excise/contract';
import { createMemoryRepositories, sampleCrInput, seedReferences } from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import { CrConflictError, CrValidationError, DefaultCrService } from './index.js';

const session =
  (role: Role): (() => Session) =>
  () => ({ userId: 'u', username: 'u', role });

function setup(role: Role) {
  const repos = createMemoryRepositories();
  const refs = seedReferences(repos.store);
  return { svc: new DefaultCrService(repos.crs, session(role)), input: sampleCrInput(refs) };
}

describe('CrService', () => {
  it('creates and rejects duplicate CR numbers per office and year', async () => {
    const { svc, input } = setup('detecting');
    await svc.create(input);
    await expect(svc.create(input)).rejects.toBeInstanceOf(CrValidationError);
  });

  it('allows reusing the number of a deleted CR', async () => {
    const { svc, input } = setup('oic');
    const first = await svc.create(input);
    await svc.softDelete(first.id);
    await expect(svc.create(input)).resolves.toBeTruthy();
  });

  it('blocks observation officers from writing', async () => {
    const { svc, input } = setup('observation');
    await expect(svc.create(input)).rejects.toThrow(/lacks permission/);
  });

  it('rejects year mismatch', async () => {
    const { svc, input } = setup('oic');
    await expect(svc.create({ ...input, crNumber: '1/2025' })).rejects.toBeInstanceOf(
      CrValidationError,
    );
  });

  it('detects stale updates', async () => {
    const { svc, input } = setup('oic');
    const saved = await svc.create(input);
    await svc.update(saved.id, 1, input);
    await expect(svc.update(saved.id, 1, input)).rejects.toBeInstanceOf(CrConflictError);
  });
});
