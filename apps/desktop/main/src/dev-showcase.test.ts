// The extra dummy data of mock mode: it must load on both backends and show up in the searches.
import { describe, expect, it } from 'vitest';
import { BACKENDS, createDevData, DEV_PASSWORD } from './dev-seed.js';
import { seedShowcase } from './dev-showcase.js';
import { createServiceHost, dispatch } from './host.js';

describe.each(BACKENDS)('showcase data (%s)', (backend) => {
  it('adds 18 CRs over two years, with cases and convictions, next to the test data', async () => {
    const { repos, refs } = await createDevData(backend);
    await seedShowcase(repos, refs);
    const { handlers } = createServiceHost(repos, { pickSavePath: async () => null });
    const call = (channel: string, ...args: unknown[]) => dispatch(handlers, channel, args);
    await call('auth.login', 'oic', DEV_PASSWORD);

    const rows = async (year: number) => {
      const r = await call('search.crimeReports', { kind: 'year', officeId: refs.office, year });
      if (!r.ok) throw new Error(r.error.message);
      return r.value as { crNumber: string; accusedName: string }[];
    };
    expect((await rows(2025)).length).toBe(8);
    expect((await rows(2026)).length).toBe(12); // 10 new + the 2 of the test data
    expect((await rows(2025)).some((r) => r.accusedName === 'කේ. ඒ. සමන් කුමාර')).toBe(true);

    const convicts = await call('search.convicts', { officeId: refs.office, year: 2025 });
    if (!convicts.ok) throw new Error(convicts.error.message);
    expect((convicts.value as unknown[]).length).toBeGreaterThan(0);
  });
});
