import type { Role } from '@excise/schemas';

export type Permission =
  | 'cr.write'
  | 'cr.read'
  | 'case.write'
  | 'search'
  | 'reports.basic'
  | 'reports.periodic_by_officer'
  | 'reference.edit'
  | 'documents.generate'
  | 'admin';

const READ_ONLY: Permission[] = ['cr.read', 'search', 'reports.basic'];

/** Role matrix from REWRITE_PLAN §1.2 / §5. */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  oic: new Set<Permission>([
    ...READ_ONLY,
    'cr.write',
    'case.write',
    'reports.periodic_by_officer',
    'reference.edit',
    'documents.generate',
    'admin',
  ]),
  detecting: new Set<Permission>([
    ...READ_ONLY,
    'cr.write',
    'case.write',
    'reports.periodic_by_officer',
    'documents.generate',
  ]),
  observation: new Set<Permission>(READ_ONLY),
  supervising: new Set<Permission>([...READ_ONLY, 'reports.periodic_by_officer']),
};

export class PermissionError extends Error {
  constructor(
    public readonly role: Role,
    public readonly permission: Permission,
  ) {
    super(`Role ${role} lacks permission ${permission}`);
  }
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Call at the top of every service method (B2: a permission check on every call). */
export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new PermissionError(role, permission);
}

const MAX_FAILED = 5;

/** Lock after N failed attempts (B2). */
export function isLocked(failedAttempts: number): boolean {
  return failedAttempts >= MAX_FAILED;
}
export * from './service.js';
