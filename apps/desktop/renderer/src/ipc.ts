// Typed client for `window.excise.call` (apps/desktop/preload/src/api.ts). Screens use `call`:
// it returns the value or throws an `IpcError` carrying the service's error code and the field
// issues, so forms can mark the fields. A lost session (not logged in, or a password change
// pending) is also announced to the app shell, which goes back to the right screen.
import type { CallResult, Channel, Handlers } from '../../preload/src/api';
import { errorLabel, label } from '@excise/labels';

export type { Channel };
export type Result<C extends Channel> = Awaited<ReturnType<Handlers[C]>>;
export type Args<C extends Channel> = Parameters<Handlers[C]>;

export interface FieldIssue {
  field: string;
  code: string;
}

export class IpcError extends Error {
  constructor(
    /** Error class name from the main process: LoginError, PermissionError, CrValidationError, … */
    readonly kind: string,
    message: string,
    readonly code?: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
  }

  static from(e: Extract<CallResult<never>, { ok: false }>['error']): IpcError {
    const issues = Array.isArray(e.issues) ? (e.issues as FieldIssue[]) : [];
    return new IpcError(e.name, e.message, e.code, issues);
  }

  /** The message to show (Sinhala when the labels file has it). */
  get caption(): string {
    if (this.kind === 'PermissionError') return label('error.permission');
    if (this.kind.endsWith('ConflictError')) return label('error.conflict');
    return errorLabel(this.code ?? this.issues[0]?.code);
  }

  /** Field path → caption, for forms. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const i of this.issues) out[i.field] ??= errorLabel(i.code);
    return out;
  }
}

type SessionListener = (reason: 'not_logged_in' | 'password_change_required') => void;
const listeners = new Set<SessionListener>();

/** The shell listens here to return to the login or change-password screen. */
export function onSessionLost(fn: SessionListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function call<C extends Channel>(channel: C, ...args: Args<C>): Promise<Result<C>> {
  const bridge = window.excise;
  if (!bridge) throw new IpcError('NoBridge', 'window.excise is missing (not running in the app)');
  const r = (await bridge.call(channel, ...args)) as CallResult<Result<C>>;
  if (r.ok) return r.value;
  const err = IpcError.from(r.error);
  if (
    err.kind === 'LoginError' &&
    (err.code === 'not_logged_in' || err.code === 'password_change_required')
  ) {
    for (const l of listeners) l(err.code);
  }
  throw err;
}
