import { hash, verify } from '@node-rs/argon2';
import type { AuthService, Session, UserRepository } from '@excise/contract';
import { Role } from '@excise/schemas';
import { assertCan, isLocked } from './index.js';

export class LoginError extends Error {
  constructor(public readonly code: 'invalid_credentials' | 'locked' | 'not_logged_in') {
    super(code);
  }
}

export class PasswordPolicyError extends Error {
  constructor(public readonly code: 'too_short' | 'username_taken' | 'bad_username') {
    super(code);
  }
}

const MIN_PASSWORD = 8;

/** Holds the logged-in user for the main process. Services read it through `current()`. */
export class SessionHolder {
  private session: Session | null = null;

  get(): Session | null {
    return this.session;
  }

  set(session: Session | null): void {
    this.session = session;
  }

  /** For services: throws when nobody is logged in. */
  current = (): Session => {
    if (!this.session) throw new LoginError('not_logged_in');
    return this.session;
  };
}

export class DefaultAuthService implements AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionHolder,
  ) {}

  async login(username: string, password: string): Promise<Session> {
    const user = await this.users.findByUsername(username.trim());
    // Same error for unknown user, inactive user and wrong password.
    if (!user || !user.active) throw new LoginError('invalid_credentials');
    if (isLocked(user.failedAttempts)) throw new LoginError('locked');

    if (!(await verify(user.passwordHash, password))) {
      await this.users.setFailedAttempts(user.id, user.failedAttempts + 1);
      throw new LoginError(isLocked(user.failedAttempts + 1) ? 'locked' : 'invalid_credentials');
    }
    if (user.failedAttempts) await this.users.setFailedAttempts(user.id, 0);

    const session: Session = { userId: user.id, username: user.username, role: user.role };
    this.sessions.set(session);
    return session;
  }

  async logout(): Promise<void> {
    this.sessions.set(null);
  }

  async currentSession(): Promise<Session | null> {
    return this.sessions.get();
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const session = this.sessions.current();
    const user = await this.users.getById(session.userId);
    if (!user || !(await verify(user.passwordHash, oldPassword))) {
      throw new LoginError('invalid_credentials');
    }
    if (newPassword.length < MIN_PASSWORD) throw new PasswordPolicyError('too_short');
    await this.users.setPasswordHash(user.id, await hash(newPassword));
  }

  async createUser(username: string, password: string, role: Role): Promise<void> {
    assertCan(this.sessions.current().role, 'admin');
    const name = username.trim();
    if (!/^[\w.-]{3,32}$/.test(name)) throw new PasswordPolicyError('bad_username');
    if (password.length < MIN_PASSWORD) throw new PasswordPolicyError('too_short');
    if (await this.users.findByUsername(name)) throw new PasswordPolicyError('username_taken');
    await this.users.create({
      username: name,
      passwordHash: await hash(password),
      role: Role.parse(role),
      active: true,
    });
  }

  /** OIC unlocks a user after the lockout (B2). */
  async unlockUser(userId: string): Promise<void> {
    assertCan(this.sessions.current().role, 'admin');
    await this.users.setFailedAttempts(userId, 0);
  }
}

/** For first start and tests: hash a password the same way login checks it. */
export const hashPassword = (password: string): Promise<string> => hash(password);
