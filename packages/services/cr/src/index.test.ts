import type { Session } from '@excise/contract';
import { createMemoryRepositories, sampleCrInput, seedReferences } from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import {
  CrConflictError,
  CrNotFoundError,
  CrValidationError,
  DefaultCrService,
  RESTORE_WINDOW_DAYS,
} from './index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function setup(role: Role, clock?: () => number) {
  const repos = createMemoryRepositories();
  const refs = seedReferences(repos.store);
  const session: Session = { userId: 'u1', username: 'u1', role };
  const svc = new DefaultCrService(repos.crs, () => session, repos.audit, clock);
  return { svc, repos, input: sampleCrInput(refs) };
}

describe('CrService', () => {
  it('creates and rejects duplicate CR numbers per office and year', async () => {
    const { svc, input } = setup('detecting');
    await svc.create(input);
    await expect(svc.create(input)).rejects.toBeInstanceOf(CrValidationError);
  });

  it('allows reusing the number of a deleted CR only once', async () => {
    const { svc, input } = setup('oic');
    const first = await svc.create(input);
    await svc.softDelete(first.id);
    await expect(svc.create(input)).resolves.toBeTruthy();
    await expect(svc.create(input)).rejects.toBeInstanceOf(CrValidationError);
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

  it('records every change in the audit log with who did it', async () => {
    const { svc, repos, input } = setup('detecting');
    const saved = await svc.create(input);
    await svc.update(saved.id, 1, { ...input, place: 'Negombo beach' });
    await svc.softDelete(saved.id);
    await svc.restore(saved.id);
    const log = repos.store.audit;
    expect(log.map((e) => e.action)).toEqual(['create', 'update', 'delete', 'restore']);
    expect(log.every((e) => e.userId === 'u1' && e.rowId === saved.id)).toBe(true);
    expect(log[1]).toMatchObject({
      before: { place: 'Kochchikade' },
      after: { place: 'Negombo beach' },
    });
  });

  it('only the OIC restores after the undo window', async () => {
    let now = Date.now();
    const det = setup('detecting', () => now);
    const saved = await det.svc.create(det.input);
    await det.svc.softDelete(saved.id);
    now += (RESTORE_WINDOW_DAYS + 1) * DAY_MS;
    await expect(det.svc.restore(saved.id)).rejects.toThrow(/lacks permission admin/);

    const oic = new DefaultCrService(
      det.repos.crs,
      () => ({ userId: 'o', username: 'o', role: 'oic' }),
      det.repos.audit,
      () => now,
    );
    await oic.restore(saved.id);
    expect((await oic.get(saved.id))?.deleted).toBe(false);
  });

  it('cannot restore a CR whose number was reused, or delete twice', async () => {
    const { svc, input } = setup('oic');
    const first = await svc.create(input);
    await svc.softDelete(first.id);
    await expect(svc.softDelete(first.id)).rejects.toBeInstanceOf(CrNotFoundError);
    await svc.create(input);
    await expect(svc.restore(first.id)).rejects.toBeInstanceOf(CrValidationError);
  });
});
