import { randomUUID } from 'node:crypto';
import { LABELS } from '@excise/labels';
import { ReportType } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import { BACKENDS, createDevData, DEV_PASSWORD, type Backend } from './dev-seed.js';
import { createServiceHost, dispatch } from './host.js';

async function setup(backend: Backend) {
  const { repos } = await createDevData(backend);
  const saved: string[] = [];
  const { handlers } = createServiceHost(repos, {
    pickSavePath: async (name) => {
      saved.push(name);
      return null;
    },
  });
  return { handlers, saved };
}

describe.each(BACKENDS)('IPC dispatch (%s)', (backend) => {
  it('rejects unknown channels and prototype keys', async () => {
    const { handlers } = await setup(backend);
    expect(await dispatch(handlers, 'fs.readFile', [])).toMatchObject({
      ok: false,
      error: { name: 'UnknownChannel' },
    });
    expect(await dispatch(handlers, 'toString', [])).toMatchObject({ ok: false });
    expect(await dispatch(handlers, 'cr.get', 'not-an-array')).toMatchObject({ ok: false });
  });

  it('requires login before any service call', async () => {
    const { handlers } = await setup(backend);
    const r = await dispatch(handlers, 'search.crimeReports', [
      { kind: 'name_nic', name: 'sample' },
    ]);
    expect(r).toMatchObject({ ok: false, error: { name: 'LoginError', code: 'not_logged_in' } });
  });

  it('runs a full flow: login, search, report, export cancelled', async () => {
    const { handlers, saved } = await setup(backend);
    const login = await dispatch(handlers, 'auth.login', ['observation', DEV_PASSWORD]);
    expect(login).toMatchObject({ ok: true, value: { role: 'observation' } });

    const found = await dispatch(handlers, 'search.crimeReports', [
      { kind: 'name_nic', name: 'sample' },
    ]);
    expect(found.ok && (found.value as unknown[]).length).toBe(2);

    const write = await dispatch(handlers, 'cr.softDelete', [randomUUID()]);
    expect(write).toMatchObject({ ok: false, error: { name: 'PermissionError' } });

    const exported = await dispatch(handlers, 'reports.export', [
      {
        scope: { kind: 'year', officeId: randomUUID(), year: 2026 },
        person: { kind: 'none' },
        type: 'register',
      },
      'csv',
    ]);
    expect(exported).toEqual({ ok: true, value: null });
    expect(saved).toEqual(['report-register.csv']);
  });

  it('a user who must change the password can do nothing else first', async () => {
    const { handlers } = await setup(backend);
    await dispatch(handlers, 'auth.login', ['oic', DEV_PASSWORD]);
    await dispatch(handlers, 'auth.createUser', ['newdet', 'temporary1', 'detecting']);
    await dispatch(handlers, 'auth.logout', []);
    const login = await dispatch(handlers, 'auth.login', ['newdet', 'temporary1']);
    expect(login).toMatchObject({ ok: true, value: { mustChangePassword: true } });
    const blocked = await dispatch(handlers, 'reference.list', ['court']);
    expect(blocked).toMatchObject({ error: { code: 'password_change_required' } });
    await dispatch(handlers, 'auth.changePassword', ['temporary1', 'my-password']);
    expect(await dispatch(handlers, 'reference.list', ['court'])).toMatchObject({ ok: true });
  });

  it('first run is refused once accounts exist', async () => {
    const { handlers } = await setup(backend);
    expect(await dispatch(handlers, 'auth.needsFirstUser', [])).toEqual({ ok: true, value: false });
    expect(await dispatch(handlers, 'auth.createFirstUser', ['boss', 'longenough'])).toMatchObject({
      ok: false,
      error: { code: 'already_set_up' },
    });
  });

  it('reference lists, users and audit go through role checks', async () => {
    const { handlers } = await setup(backend);
    await dispatch(handlers, 'auth.login', ['observation', DEV_PASSWORD]);
    expect(await dispatch(handlers, 'reference.list', ['offence'])).toMatchObject({ ok: true });
    for (const [channel, args] of [
      ['reference.add', ['court', { value: 'X' }]],
      ['users.list', []],
      ['audit.search', [{}]],
    ] as const) {
      expect(await dispatch(handlers, channel, args), channel).toMatchObject({
        ok: false,
        error: { name: 'PermissionError' },
      });
    }
    await dispatch(handlers, 'auth.logout', []);
    await dispatch(handlers, 'auth.login', ['oic', DEV_PASSWORD]);
    const added = await dispatch(handlers, 'reference.add', ['court', { value: 'Gampaha' }]);
    expect(added).toMatchObject({ ok: true, value: { kind: 'court', value: 'Gampaha' } });
    const audit = await dispatch(handlers, 'audit.search', [{ table: 'reference_items' }]);
    expect(audit.ok && (audit.value as unknown[]).length).toBe(1);
    expect(await dispatch(handlers, 'reference.list', ['nonsense'])).toMatchObject({
      error: { name: 'InvalidArguments' },
    });
  });

  it('rejects arguments of the wrong shape before the service runs', async () => {
    const { handlers } = await setup(backend);
    await dispatch(handlers, 'auth.login', ['oic', DEV_PASSWORD]);
    const bad = [
      ['cr.get', ['not-a-uuid']],
      ['cr.get', [randomUUID(), 'extra']],
      ['auth.login', [{ $ne: '' }, 'x']],
      ['search.crimeReports', [{ kind: 'year', officeId: randomUUID(), year: '2026' }]],
      ['reports.run', [{ scope: { kind: 'all' }, person: { kind: 'none' }, type: 'register' }]],
      [
        'reports.export',
        [
          {
            scope: { kind: 'year', officeId: randomUUID(), year: 2026 },
            person: { kind: 'none' },
            type: 'register',
          },
          'pdf',
        ],
      ],
    ] as const;
    for (const [channel, args] of bad) {
      const r = await dispatch(handlers, channel, args);
      expect(r, channel).toMatchObject({ ok: false, error: { name: 'InvalidArguments' } });
    }
  });

  it('keeps validation issues on errors', async () => {
    const { handlers } = await setup(backend);
    await dispatch(handlers, 'auth.login', ['oic', DEV_PASSWORD]);
    const r = await dispatch(handlers, 'cr.create', [{}]);
    expect(r.ok).toBe(false);
    expect(!r.ok && Array.isArray(r.error.issues)).toBe(true);
  });

  it('every report column and report type has a caption in the labels file', async () => {
    const { handlers } = await setup(backend);
    await dispatch(handlers, 'auth.login', ['oic', DEV_PASSWORD]);
    for (const type of ReportType.options) {
      expect(LABELS, type).toHaveProperty([`reportType.${type}`]);
      const r = await dispatch(handlers, 'reports.run', [
        {
          scope: { kind: 'year', officeId: randomUUID(), year: 2026 },
          person: { kind: 'none' },
          type,
        },
      ]);
      if (!r.ok) throw new Error(r.error.message);
      const result = r.value as { columns: { labelKey: string }[] };
      for (const c of result.columns) expect(LABELS, c.labelKey).toHaveProperty([c.labelKey]);
    }
  });
});
