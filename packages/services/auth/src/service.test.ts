import { createMemoryRepositories } from '@excise/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DefaultAuthService,
  hashPassword,
  LoginError,
  PasswordPolicyError,
  SessionHolder,
} from './index.js';

let auth: DefaultAuthService;
let sessions: SessionHolder;

beforeEach(async () => {
  const repos = createMemoryRepositories();
  sessions = new SessionHolder();
  auth = new DefaultAuthService(repos.users, sessions);
  await repos.users.create({
    username: 'oic',
    passwordHash: await hashPassword('correct-horse'),
    role: 'oic',
    active: true,
  });
});

describe('AuthService', () => {
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
});
