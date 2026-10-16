// Service host: wires every service to the repositories and lists the IPC channels the UI may call.
// Electron-free so it can be unit tested.
import { DefaultAuthService, SessionHolder, assertCan } from '@excise/auth';
import { DefaultCaseService } from '@excise/case';
import type {
  AuditSink,
  CaseRepository,
  CrQueryRepository,
  CrRepository,
  ReferenceLookup,
  ReportRowRepository,
  UserRepository,
} from '@excise/contract';
import type { ReportParams } from '@excise/contract';
import { DefaultCrService } from '@excise/cr';
import { DefaultDocDataService } from '@excise/docdata';
import { label } from '@excise/labels';
import { DefaultReportService } from '@excise/reports';
import { DefaultSearchService } from '@excise/search';
import { ARG_SCHEMAS } from './args.js';

export interface Repositories {
  crs: CrRepository;
  cases: CaseRepository;
  queries: CrQueryRepository;
  reportRows: ReportRowRepository;
  users: UserRepository;
  refs: ReferenceLookup;
  audit: AuditSink;
}

export interface HostOptions {
  /** Asks the user where to save an export; null when cancelled. */
  pickSavePath: (defaultName: string) => Promise<string | null>;
  /** Caption for a label key; defaults to packages/shared/labels. */
  label?: (key: string) => string;
}

export function createServiceHost(repos: Repositories, opts: HostOptions) {
  const sessions = new SessionHolder();
  const current = sessions.current;

  const auth = new DefaultAuthService(repos.users, sessions, repos.audit);
  const cr = new DefaultCrService(repos.crs, current, repos.audit);
  const cases = new DefaultCaseService(repos.cases, repos.crs, current, repos.audit);
  const search = new DefaultSearchService(repos.queries, current);
  const reports = new DefaultReportService(repos.reportRows, current, opts.label ?? label);
  const docdata = new DefaultDocDataService(repos.crs, repos.cases, repos.refs, current);

  const handlers = {
    'auth.login': (username: string, password: string) => auth.login(username, password),
    'auth.logout': () => auth.logout(),
    'auth.currentSession': () => auth.currentSession(),
    'auth.changePassword': (oldPassword: string, newPassword: string) =>
      auth.changePassword(oldPassword, newPassword),
    'auth.createUser': (...a: Parameters<typeof auth.createUser>) => auth.createUser(...a),
    'auth.unlockUser': (userId: string) => auth.unlockUser(userId),

    'cr.create': (...a: Parameters<typeof cr.create>) => cr.create(...a),
    'cr.update': (...a: Parameters<typeof cr.update>) => cr.update(...a),
    'cr.get': (id: string) => cr.get(id),
    'cr.find': (...a: Parameters<typeof cr.find>) => cr.find(...a),
    'cr.softDelete': (id: string) => cr.softDelete(id),
    'cr.restore': (id: string) => cr.restore(id),

    'case.save': (...a: Parameters<typeof cases.save>) => cases.save(...a),
    'case.getByCrimeReport': (crimeReportId: string) => cases.getByCrimeReport(crimeReportId),

    'search.crimeReports': (...a: Parameters<typeof search.crimeReports>) =>
      search.crimeReports(...a),
    'search.convicts': (...a: Parameters<typeof search.convicts>) => search.convicts(...a),
    'search.previousOffences': (...a: Parameters<typeof search.previousOffences>) =>
      search.previousOffences(...a),

    'reports.run': (params: ReportParams) => reports.run(params),
    'reports.summary': (...a: Parameters<typeof reports.summary>) => reports.summary(...a),
    /** Main process picks the file; the UI never passes a path. Returns null when cancelled. */
    'reports.export': async (params: ReportParams, format: 'xlsx' | 'csv') => {
      assertCan(current().role, 'reports.basic');
      const path = await opts.pickSavePath(`report-${params.type}.${format}`);
      return path ? reports.exportToFile(params, format, path) : null;
    },

    'docdata.buildFor': (crimeReportId: string) => docdata.buildFor(crimeReportId),
  } satisfies Record<string, (...args: never[]) => Promise<unknown>>;

  return { handlers, sessions };
}

export type Handlers = ReturnType<typeof createServiceHost>['handlers'];
export type Channel = keyof Handlers;

/** What every IPC call resolves to. Errors are plain data so their fields survive IPC. */
export type CallResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { name: string; message: string; code?: string; issues?: unknown } };

export function serializeError(e: unknown): Extract<CallResult<never>, { ok: false }>['error'] {
  if (e instanceof Error) {
    const extra = e as Error & { code?: unknown; issues?: unknown };
    return {
      name: e.constructor.name,
      message: e.message,
      ...(typeof extra.code === 'string' ? { code: extra.code } : {}),
      ...(extra.issues !== undefined ? { issues: extra.issues } : {}),
    };
  }
  return { name: 'Error', message: String(e) };
}

/**
 * Runs one call by channel name. Unknown channels, arguments of the wrong shape and thrown errors
 * all become `ok: false`.
 */
export async function dispatch(
  handlers: Handlers,
  channel: unknown,
  args: unknown,
): Promise<CallResult<unknown>> {
  if (typeof channel !== 'string' || !Object.hasOwn(handlers, channel) || !Array.isArray(args)) {
    return { ok: false, error: { name: 'UnknownChannel', message: String(channel) } };
  }
  const parsed = ARG_SCHEMAS[channel as Channel].safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        name: 'InvalidArguments',
        message: channel,
        issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), code: i.code })),
      },
    };
  }
  try {
    const fn = handlers[channel as Channel] as (...a: unknown[]) => Promise<unknown>;
    return { ok: true, value: await fn(...(parsed.data as unknown[])) };
  } catch (e) {
    return { ok: false, error: serializeError(e) };
  }
}
