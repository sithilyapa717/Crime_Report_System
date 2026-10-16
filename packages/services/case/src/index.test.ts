import type { Session } from '@excise/contract';
import {
  createMemoryRepositories,
  sampleCaseInput,
  sampleCrInput,
  seedReferences,
} from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import { CaseConflictError, CaseValidationError, DefaultCaseService } from './index.js';

const session =
  (role: Role): (() => Session) =>
  () => ({ userId: 'u', username: 'u', role });

async function setup(role: Role = 'oic') {
  const repos = createMemoryRepositories();
  const refs = seedReferences(repos.store);
  const cr = await repos.crs.insert(sampleCrInput(refs));
  const svc = new DefaultCaseService(repos.cases, repos.crs, session(role));
  return { repos, refs, cr, svc };
}

describe('CaseService', () => {
  it('saves a case then updates it with the right version', async () => {
    const { refs, cr, svc } = await setup();
    const first = await svc.save(sampleCaseInput(cr.id, refs), null);
    expect(first.version).toBe(1);
    const second = await svc.save(sampleCaseInput(cr.id, refs, { caseType: 'warrant' }), 1);
    expect(second.version).toBe(2);
    expect(second.caseType).toBe('warrant');
  });

  it('rejects a stale save', async () => {
    const { refs, cr, svc } = await setup();
    await svc.save(sampleCaseInput(cr.id, refs), null);
    await svc.save(sampleCaseInput(cr.id, refs), 1);
    await expect(svc.save(sampleCaseInput(cr.id, refs), 1)).rejects.toBeInstanceOf(
      CaseConflictError,
    );
  });

  it('does not allow an outcome without a case number', async () => {
    const { refs, cr, svc } = await setup();
    const input = sampleCaseInput(cr.id, refs, {
      caseNumber: undefined,
      outcomes: [{ outcomeType: 'fine', fineAmount: 500000, addToConvictRegister: true }],
    });
    await expect(svc.save(input, null)).rejects.toBeInstanceOf(CaseValidationError);
  });

  it('rejects hearings before the detection date and a fine without an amount', async () => {
    const { refs, cr, svc } = await setup();
    const input = sampleCaseInput(cr.id, refs, {
      hearings: [{ kind: 'trial', date: '2025-12-31' }],
      outcomes: [{ outcomeType: 'fine', addToConvictRegister: false }],
    });
    const err = await svc.save(input, null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CaseValidationError);
    expect((err as CaseValidationError).issues.map((i) => i.code).sort()).toEqual([
      'before_detection',
      'required',
    ]);
  });

  it('blocks observation officers', async () => {
    const { refs, cr, svc } = await setup('observation');
    await expect(svc.save(sampleCaseInput(cr.id, refs), null)).rejects.toThrow(/lacks permission/);
  });
});
