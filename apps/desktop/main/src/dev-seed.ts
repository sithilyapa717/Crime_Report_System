// Mock mode: in-memory data so C, A and D can run the app before packages/db exists.
// The dev accounts are listed in apps/desktop/main/README.md. Never used with a real database.
import { hashPassword } from '@excise/auth';
import {
  createMemoryRepositories,
  sampleCaseInput,
  sampleCrInput,
  seedReferences,
  type MemoryRepositories,
} from '@excise/mocks';
import type { Role } from '@excise/schemas';

export const DEV_PASSWORD = 'dev-password';
export const DEV_USERS: Record<string, Role> = {
  oic: 'oic',
  detecting: 'detecting',
  observation: 'observation',
  supervising: 'supervising',
};

export async function createDevRepositories(): Promise<MemoryRepositories> {
  const repos = createMemoryRepositories();
  const refs = seedReferences(repos.store);
  const passwordHash = await hashPassword(DEV_PASSWORD);
  for (const [username, role] of Object.entries(DEV_USERS)) {
    await repos.users.create({ username, passwordHash, role, active: true });
  }
  const cr = await repos.crs.insert(sampleCrInput(refs));
  await repos.cases.save(
    sampleCaseInput(cr.id, refs, {
      outcomes: [
        { outcomeType: 'fine', fineAmount: 500000, convictedDate: '2026-01-20', addToConvictRegister: true },
      ],
    }),
    null,
  );
  await repos.crs.insert(sampleCrInput(refs, { crNumber: '2/2026', detectionDate: '2026-01-05' }));
  return repos;
}
