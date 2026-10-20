import { hash, verify } from '@node-rs/argon2';
import type {
  AuditAction,
  AuditSink,
  AuthService,
  Session,
  UserAdminService,
  UserRecord,
  UserRepository,
  UserSummary,
} from '@excise/contract';
import { Role } from '@excise/schemas';
import { assertCan, isLocked } from './index.js';

export class LoginError extends Error {
  constructor(
    public readonly code:
      | 'invalid_credentials'
      | 'locked'
      | 'not_logged_in'
      | 'password_change_required'
      | 'already_set_up',
  ) {
    super(code);
  }
}

export class PasswordPolicyError extends Error {
  constructor(
    public readonly code:
      | 'too_short'
      | 'username_taken'
      | 'bad_username'
      | 'same_password'
      | 'own_account'
      | 'not_found',
  ) {
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
    private readonly audit: AuditSink,
  ) {}

  /** Audit entries for users never include the password hash. */
  private record(
    action: AuditAction,
    rowId: string | null,
    after: unknown,
    userId?: string | null,
  ) {
    return this.audit.record({
      userId: userId === undefined ? (this.sessions.get()?.userId ?? null) : userId,
      action,
      table: 'users',
      rowId,
      before: null,
      after,
    });
  }

  async login(username: string, password: string): Promise<Session> {
    const user = await this.users.findByUsername(username.trim());
    // Same error for unknown user, inactive user and wrong password.
    if (!user || !user.active || isLocked(user.failedAttempts)) {
      await this.record('login_failed', user?.id ?? null, { username: username.trim() }, null);
      throw new LoginError(
        user && isLocked(user.failedAttempts) ? 'locked' : 'invalid_credentials',
      );
    }

    if (!(await verify(user.passwordHash, password))) {
      await this.users.setFailedAttempts(user.id, user.failedAttempts + 1);
      await this.record('login_failed', user.id, { username: user.username }, null);
      throw new LoginError(isLocked(user.failedAttempts + 1) ? 'locked' : 'invalid_credentials');
    }
    if (user.failedAttempts) await this.users.setFailedAttempts(user.id, 0);

    const session = toSession(user);
    this.sessions.set(session);
    await this.record('login', user.id, { username: user.username, role: user.role });
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
    if (newPassword === oldPassword) throw new PasswordPolicyError('same_password');
    await this.users.setPasswordHash(user.id, await hash(newPassword), false);
    this.sessions.set({ ...session, mustChangePassword: false });
    await this.record('password_change', user.id, { username: user.username });
  }

  async createUser(username: string, password: string, role: Role): Promise<void> {
    assertCan(this.sessions.current().role, 'admin');
    const created = await this.insertUser(username, password, Role.parse(role), true);
    await this.record('user_create', created.id, {
      username: created.username,
      role: created.role,
    });
  }

  async needsFirstUser(): Promise<boolean> {
    return (await this.users.count()) === 0;
  }

  /** First run: the station head creates their own account; no default password ever exists. */
  async createFirstUser(username: string, password: string): Promise<Session> {
    if (!(await this.needsFirstUser())) throw new LoginError('already_set_up');
    const created = await this.insertUser(username, password, 'oic', false);
    const session = toSession(created);
    this.sessions.set(session);
    await this.record('user_create', created.id, { username: created.username, role: 'oic' });
    return session;
  }

  private async insertUser(
    username: string,
    password: string,
    role: Role,
    mustChangePassword: boolean,
  ): Promise<UserRecord> {
    const name = username.trim();
    if (!USERNAME.test(name)) throw new PasswordPolicyError('bad_username');
    if (password.length < MIN_PASSWORD) throw new PasswordPolicyError('too_short');
    if (await this.users.findByUsername(name)) throw new PasswordPolicyError('username_taken');
    return this.users.create({
      username: name,
      passwordHash: await hash(password),
      role,
      active: true,
      mustChangePassword,
    });
  }

  /** OIC unlocks a user after the lockout (B2). */
  async unlockUser(userId: string): Promise<void> {
    assertCan(this.sessions.current().role, 'admin');
    await this.users.setFailedAttempts(userId, 0);
    await this.record('user_unlock', userId, null);
  }
}

/** OIC users screen: list, deactivate, reset password (A). */
export class DefaultUserAdminService implements UserAdminService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionHolder,
    private readonly audit: AuditSink,
  ) {}

  private async target(userId: string): Promise<UserRecord> {
    const user = await this.users.getById(userId);
    if (!user) throw new PasswordPolicyError('not_found');
    return user;
  }

  private record(action: AuditAction, rowId: string, after: unknown) {
    return this.audit.record({
      userId: this.sessions.current().userId,
      action,
      table: 'users',
      rowId,
      before: null,
      after,
    });
  }

  async list(): Promise<UserSummary[]> {
    assertCan(this.sessions.current().role, 'admin');
    return (await this.users.list())
      .map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        active: u.active,
        locked: isLocked(u.failedAttempts),
        mustChangePassword: u.mustChangePassword,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  async setActive(userId: string, active: boolean): Promise<void> {
    const me = this.sessions.current();
    assertCan(me.role, 'admin');
    if (!active && userId === me.userId) throw new PasswordPolicyError('own_account');
    const user = await this.target(userId);
    await this.users.setActive(user.id, active);
    await this.record('user_update', user.id, { username: user.username, active });
  }

  async resetPassword(userId: string, temporaryPassword: string): Promise<void> {
    assertCan(this.sessions.current().role, 'admin');
    if (temporaryPassword.length < MIN_PASSWORD) throw new PasswordPolicyError('too_short');
    const user = await this.target(userId);
    await this.users.setPasswordHash(user.id, await hash(temporaryPassword), true);
    await this.users.setFailedAttempts(user.id, 0);
    await this.record('password_reset', user.id, { username: user.username });
  }
}

const USERNAME = /^[\w.-]{3,32}$/;

function toSession(user: UserRecord): Session {
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

/** For first start and tests: hash a password the same way login checks it. */
export const hashPassword = (password: string): Promise<string> => hash(password);
