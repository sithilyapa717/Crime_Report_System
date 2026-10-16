import { describe, expect, it } from 'vitest';
import { createDevRepositories, DEV_PASSWORD } from './dev-seed.js';
import { createServiceHost, dispatch } from './host.js';

async function setup() {
  const repos = await createDevRepositories();
  const saved: string[] = [];
  const { handlers } = createServiceHost(repos, {
    pickSavePath: async (name) => {
      saved.push(name);
      return null;
    },
  });
  return { handlers, saved };
}

describe('IPC dispatch', () => {
  it('rejects unknown channels and prototype keys', async () => {
    const { handlers } = await setup();
    expect(await dispatch(handlers, 'fs.readFile', [])).toMatchObject({ ok: false, error: { name: 'UnknownChannel' } });
    expect(await dispatch(handlers, 'toString', [])).toMatchObject({ ok: false });
    expect(await dispatch(handlers, 'cr.get', 'not-an-array')).toMatchObject({ ok: false });
  });

  it('requires login before any service call', async () => {
    const { handlers } = await setup();
    const r = await dispatch(handlers, 'search.crimeReports', [{ kind: 'name_nic', name: 'sample' }]);
    expect(r).toMatchObject({ ok: false, error: { name: 'LoginError', code: 'not_logged_in' } });
  });

  it('runs a full flow: login, search, report, export cancelled', async () => {
    const { handlers, saved } = await setup();
    const login = await dispatch(handlers, 'auth.login', ['observation', DEV_PASSWORD]);
    expect(login).toMatchObject({ ok: true, value: { role: 'observation' } });

    const found = await dispatch(handlers, 'search.crimeReports', [{ kind: 'name_nic', name: 'sample' }]);
    expect(found.ok && (found.value as unknown[]).length).toBe(2);

    const write = await dispatch(handlers, 'cr.softDelete', ['x']);
    expect(write).toMatchObject({ ok: false, error: { name: 'PermissionError' } });

    const exported = await dispatch(handlers, 'reports.export', [
      { scope: { kind: 'year', officeId: 'x', year: 2026 }, person: { kind: 'none' }, type: 'register' },
      'csv',
    ]);
    expect(exported).toEqual({ ok: true, value: null });
    expect(saved).toEqual(['report-register.csv']);
  });

  it('keeps validation issues on errors', async () => {
    const { handlers } = await setup();
    await dispatch(handlers, 'auth.login', ['oic', DEV_PASSWORD]);
    const r = await dispatch(handlers, 'cr.create', [{}]);
    expect(r.ok).toBe(false);
    expect(!r.ok && Array.isArray(r.error.issues)).toBe(true);
  });
});
