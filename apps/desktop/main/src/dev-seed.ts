// Development data: four dev accounts, the sample lists and two sample CRs, on either backend.
//   memory  in-memory repositories (lost when the app closes): EXCISE_MOCK=1, and the tests
//   sqlite  an SQLite database (`:memory:` in tests)
// The dev accounts are listed in apps/desktop/main/README.md. Never used for real data.
import { hashPassword } from '@excise/auth';
import { createSqliteRepositories, openDatabase } from '@excise/db';
import {
  createMemoryRepositories,
  sampleCaseInput,
  sampleCrInput,
  seedSampleReferences,
  type SampleRefs,
} from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { seedShowcase } from './dev-showcase.js';
import type { Repositories } from './host.js';

export const DEV_PASSWORD = 'dev-password';
export const DEV_USERS: Record<string, Role> = {
  oic: 'oic',
  detecting: 'detecting',
  observation: 'observation',
  supervising: 'supervising',
};

export type Backend = 'memory' | 'sqlite';
export const BACKENDS: Backend[] = ['memory', 'sqlite'];

export interface DevData {
  repos: Repositories;
  refs: SampleRefs;
  /** CR 1/2026 (with a case and a fine) and CR 2/2026. */
  crIds: [string, string];
}

/** Adds the dev accounts and sample data to empty repositories. */
export async function seedDev(repos: Repositories): Promise<Omit<DevData, 'repos'>> {
  const refs = await seedSampleReferences(repos.references);
  const passwordHash = await hashPassword(DEV_PASSWORD);
  for (const [username, role] of Object.entries(DEV_USERS)) {
    await repos.users.create({
      username,
      passwordHash,
      role,
      active: true,
      mustChangePassword: false,
    });
  }
  const cr = await repos.crs.insert(sampleCrInput(refs));
  await repos.cases.save(
    sampleCaseInput(cr.id, refs, {
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
  const second = await repos.crs.insert(
    sampleCrInput(refs, { crNumber: '2/2026', detectionDate: '2026-01-05' }),
  );
  return { refs, crIds: [cr.id, second.id] };
}

export async function createDevData(backend: Backend = 'memory'): Promise<DevData> {
  const repos: Repositories =
    backend === 'memory'
      ? createMemoryRepositories()
      : createSqliteRepositories(openDatabase(':memory:'));
  return { repos, ...(await seedDev(repos)) };
}

/** Mock mode for `EXCISE_MOCK=1`: in-memory repositories with the dev data. */
export async function createDevRepositories(): Promise<Repositories> {
  const { repos, refs } = await createDevData('memory');
  await seedShowcase(repos, refs);
  return repos;
}
