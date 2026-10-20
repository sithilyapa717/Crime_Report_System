import type { Session } from '@excise/contract';
import { createMemoryRepositories } from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import { DefaultAuditQueryService } from './index.js';

const session =
  (role: Role): (() => Session) =>
  () => ({ userId: 'u', username: 'u', role, mustChangePassword: false });

const ROW = '7f1c1d2e-1111-4a4a-8b8b-000000000001';

async function setup(role: Role = 'oic') {
  const repos = createMemoryRepositories();
  const user = await repos.users.create({
    username: 'oic1',
    passwordHash: 'x',
    role: 'oic',
    active: true,
    mustChangePassword: false,
  });
  const entry = { before: null, after: null };
  await repos.audit.record({
    ...entry,
    userId: user.id,
    action: 'create',
    table: 'crime_reports',
    rowId: ROW,
  });
  await repos.audit.record({
    ...entry,
    userId: user.id,
    action: 'update',
    table: 'crime_reports',
    rowId: ROW,
  });
  await repos.audit.record({
    ...entry,
    userId: null,
    action: 'login_failed',
    table: 'users',
    rowId: null,
  });
  return { repos, user, svc: new DefaultAuditQueryService(repos.auditQuery, session(role)) };
}

describe('AuditQueryService', () => {
  it('filters by table and row, newest first, with the user name', async () => {
    const { svc } = await setup();
    const rows = await svc.search({ table: 'crime_reports', rowId: ROW });
    expect(rows.map((r) => r.action)).toEqual(['update', 'create']);
    expect(rows[0]).toMatchObject({ username: 'oic1' });
    expect(await svc.search({})).toHaveLength(3);
    expect(await svc.search({ limit: 1 })).toHaveLength(1);
  });

  it('filters by user and by date range', async () => {
    const { svc, user } = await setup();
    expect(await svc.search({ userId: user.id })).toHaveLength(2);
    const today = new Date().toISOString().slice(0, 10);
    expect(await svc.search({ from: today, to: today })).toHaveLength(3);
    expect(await svc.search({ to: '2000-01-01' })).toHaveLength(0);
    expect(await svc.search({ from: '2030-01-02', to: '2030-01-01' })).toHaveLength(0);
  });

  it('is for the OIC only', async () => {
    const { svc } = await setup('supervising');
    await expect(svc.search({})).rejects.toThrow(/lacks permission/);
  });
});
