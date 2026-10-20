import { createMemoryRepositories } from '@excise/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DefaultAuthService,
  DefaultUserAdminService,
  hashPassword,
  LoginError,
  PasswordPolicyError,
  SessionHolder,
} from './index.js';

let auth: DefaultAuthService;
let sessions: SessionHolder;
let repos: ReturnType<typeof createMemoryRepositories>;

beforeEach(async () => {
  repos = createMemoryRepositories();
  sessions = new SessionHolder();
  auth = new DefaultAuthService(repos.users, sessions, repos.audit);
  await repos.users.create({
    username: 'oic',
    passwordHash: await hashPassword('correct-horse'),
    role: 'oic',
    active: true,
    mustChangePassword: false,
  });
});

describe('AuthService', () => {
  it('audits logins and user changes without password hashes', async () => {
    await auth.login('oic', 'wrong').catch(() => undefined);
    await auth.login('nobody', 'x').catch(() => undefined);
    const s = await auth.login('oic', 'correct-horse');
    await auth.createUser('det1', 'longenough', 'detecting');
    expect(repos.store.audit.map((e) => [e.action, e.userId])).toEqual([
      ['login_failed', null],
      ['login_failed', null],
      ['login', s.userId],
      ['user_create', s.userId],
    ]);
    expect(JSON.stringify(repos.store.audit)).not.toMatch(/\$argon2|longenough|correct-horse/);
  });

  it('logs in and out', async () => {
    const s = await auth.login('oic', 'correct-horse');
    expect(s.role).toBe('oic');
    expect(await auth.currentSession()).toEqual(s);
    await auth.logout();
    expect(await auth.currentSession()).toBeNull();
  });

  it('gives the same error for unknown user and wrong password', async () => {
    await expect(auth.login('nobody', 'x')).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(auth.login('oic', 'wrong')).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('locks after 5 wrong passwords, even with the right one afterwards', async () => {
    for (let i = 0; i < 4; i++) await auth.login('oic', 'wrong').catch(() => undefined);
    await expect(auth.login('oic', 'wrong')).rejects.toMatchObject({ code: 'locked' });
    await expect(auth.login('oic', 'correct-horse')).rejects.toMatchObject({ code: 'locked' });
  });

  it('only the OIC creates users, with a password policy', async () => {
    await expect(auth.createUser('x', 'longenough', 'detecting')).rejects.toBeInstanceOf(
      LoginError,
    );
    await auth.login('oic', 'correct-horse');
    await expect(auth.createUser('det1', 'short', 'detecting')).rejects.toBeInstanceOf(
      PasswordPolicyError,
    );
    await auth.createUser('det1', 'longenough', 'detecting');
    await expect(auth.createUser('det1', 'longenough', 'detecting')).rejects.toMatchObject({
      code: 'username_taken',
    });
    await auth.logout();
    const s = await auth.login('det1', 'longenough');
    expect(s.role).toBe('detecting');
    await expect(auth.createUser('det2', 'longenough', 'oic')).rejects.toThrow(/lacks permission/);
  });

  it('changes password only with the old one', async () => {
    await auth.login('oic', 'correct-horse');
    await expect(auth.changePassword('wrong', 'new-password')).rejects.toBeInstanceOf(LoginError);
    await auth.changePassword('correct-horse', 'new-password');
    await auth.logout();
    await expect(auth.login('oic', 'new-password')).resolves.toBeTruthy();
  });

  it('new users must change their password at first login', async () => {
    await auth.login('oic', 'correct-horse');
    await auth.createUser('det1', 'temporary1', 'detecting');
    await auth.logout();
    const s = await auth.login('det1', 'temporary1');
    expect(s.mustChangePassword).toBe(true);
    await expect(auth.changePassword('temporary1', 'temporary1')).rejects.toMatchObject({
      code: 'same_password',
    });
    await auth.changePassword('temporary1', 'my-own-password');
    expect((await auth.currentSession())?.mustChangePassword).toBe(false);
    await auth.logout();
    expect((await auth.login('det1', 'my-own-password')).mustChangePassword).toBe(false);
  });
});

describe('first run', () => {
  it('creates the first OIC once, then refuses', async () => {
    const fresh = createMemoryRepositories();
    const s = new SessionHolder();
    const a = new DefaultAuthService(fresh.users, s, fresh.audit);
    expect(await a.needsFirstUser()).toBe(true);
    await expect(a.createFirstUser('x', 'longenough')).rejects.toMatchObject({
      code: 'bad_username',
    });
    const session = await a.createFirstUser('station.head', 'longenough');
    expect(session).toMatchObject({ role: 'oic', mustChangePassword: false });
    expect(await a.currentSession()).toEqual(session);
    expect(await a.needsFirstUser()).toBe(false);
    await expect(a.createFirstUser('second', 'longenough')).rejects.toMatchObject({
      code: 'already_set_up',
    });
  });
});

describe('UserAdminService', () => {
  it('lists, deactivates and resets passwords (OIC only), never its own account', async () => {
    const admin = new DefaultUserAdminService(repos.users, sessions, repos.audit);
    await expect(admin.list()).rejects.toBeInstanceOf(LoginError);
    const me = await auth.login('oic', 'correct-horse');
    await auth.createUser('det1', 'longenough', 'detecting');
    const det = (await admin.list()).find((u) => u.username === 'det1')!;
    expect(det).toMatchObject({ role: 'detecting', active: true, locked: false });

    await expect(admin.setActive(me.userId, false)).rejects.toMatchObject({ code: 'own_account' });
    await admin.setActive(det.id, false);
    await auth.logout();
    await expect(auth.login('det1', 'longenough')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });

    // Lock det1, then reset: unlocked and must change the password.
    await auth.login('oic', 'correct-horse');
    await admin.setActive(det.id, true);
    await auth.logout();
    for (let i = 0; i < 5; i++) await auth.login('det1', 'wrong').catch(() => undefined);
    await auth.login('oic', 'correct-horse');
    expect((await admin.list()).find((u) => u.id === det.id)?.locked).toBe(true);
    await admin.resetPassword(det.id, 'temporary2');
    await auth.logout();
    expect(await auth.login('det1', 'temporary2')).toMatchObject({ mustChangePassword: true });
    await expect(admin.list()).rejects.toThrow(/lacks permission/);
    expect(JSON.stringify(repos.store.audit)).not.toMatch(/temporary2|\$argon2/);
  });
});
