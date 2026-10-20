// Service host: wires every service to the repositories and lists the IPC channels the UI may call.
// Electron-free so it can be unit tested; main.ts passes the Electron parts (dialogs, shell, print).
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { DefaultAuditQueryService } from '@excise/audit';
import {
  DefaultAuthService,
  DefaultUserAdminService,
  LoginError,
  SessionHolder,
  assertCan,
} from '@excise/auth';
import type { DefaultBackupService } from '@excise/backup';
import { DefaultCaseService } from '@excise/case';
import type {
  AuditQueryRepository,
  AuditSink,
  CaseRepository,
  CrQueryRepository,
  CrRepository,
  FileRepository,
  ReferenceLookup,
  ReferenceRepository,
  ReportRowRepository,
  UserRepository,
} from '@excise/contract';
import type { BackupSettingsInput, ReportParams } from '@excise/contract';
import { DefaultCrService } from '@excise/cr';
import { DefaultDocDataService } from '@excise/docdata';
import {
  DocumentsService,
  type DocumentGenerator,
  type GenerationLog,
  type TemplateRegistry,
} from '@excise/documents';
import { cleanOrphanFiles, DefaultFileService } from '@excise/files';
import { DefaultImportService, reportCsv, type AccdbReader } from '@excise/migration';
import { label } from '@excise/labels';
import { DefaultReferenceService } from '@excise/reference';
import { DefaultReportService } from '@excise/reports';
import { DefaultSearchService } from '@excise/search';
import { ARG_SCHEMAS } from './args.js';
import { DefaultPrintService, type PrintOutput } from './print.js';

export interface Repositories {
  crs: CrRepository;
  cases: CaseRepository;
  queries: CrQueryRepository;
  reportRows: ReportRowRepository;
  users: UserRepository;
  refs: ReferenceLookup;
  audit: AuditSink;
  references: ReferenceRepository;
  auditQuery: AuditQueryRepository;
  files: FileRepository;
}

/** Electron parts and app folders. Channels whose part is missing fail with `NotAvailable`. */
export interface HostOptions {
  /** Asks the user where to save an export; null when cancelled. */
  pickSavePath: (defaultName: string) => Promise<string | null>;
  /** Asks the user for a picture/PDF to attach or an Access file to import; null when cancelled. */
  pickOpenPath?: (kind: 'picture' | 'accdb') => Promise<string | null>;
  /** Asks the user for a folder (backup target, or a backup to restore); null when cancelled. */
  pickFolder?: (purpose: 'backup' | 'restore') => Promise<string | null>;
  openPath?: (path: string) => Promise<void>;
  showItemInFolder?: (path: string) => void;
  /** Caption for a label key; defaults to packages/shared/labels. */
  label?: (key: string) => string;
  /** Stored pictures (`<userData>/files`). */
  filesDir?: string;
  documents?: { generator: DocumentGenerator; registry: TemplateRegistry; log: GenerationLog };
  backup?: DefaultBackupService;
  printOutput?: PrintOutput;
  /** Called after a restore replaced the database; the main process restarts the app. */
  onRestored?: () => void;
  /** The main-process log file, for "show the log file" (support). */
  logFile?: string;
  /** Access import (Windows): the reader, and where the last report is kept. */
  importer?: {
    read: AccdbReader;
    reportFile: string;
    transaction?: <T>(fn: () => Promise<T>) => Promise<T>;
  };
}

export class NotAvailableError extends Error {
  constructor(public readonly code: string) {
    super(`${code} is not available`);
  }
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new NotAvailableError(what);
  return value;
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
  const users = new DefaultUserAdminService(repos.users, sessions, repos.audit);
  const reference = new DefaultReferenceService(repos.references, current, repos.audit);
  const auditQuery = new DefaultAuditQueryService(repos.auditQuery, current);
  const files = opts.filesDir
    ? new DefaultFileService(repos.files, repos.crs, opts.filesDir, current, repos.audit)
    : undefined;
  const documents = opts.documents
    ? new DocumentsService({ ...opts.documents, docData: docdata, session: current })
    : undefined;
  const print = opts.printOutput
    ? new DefaultPrintService(search, reports, repos.refs, opts.label ?? label, opts.printOutput)
    : undefined;

  const importer =
    opts.importer && opts.filesDir
      ? new DefaultImportService({
          ...opts.importer,
          references: repos.references,
          crs: repos.crs,
          cases: repos.cases,
          files: repos.files,
          audit: repos.audit,
          filesDir: opts.filesDir,
          session: current,
        })
      : undefined;
  /** The file of the last dry run: a real run always imports the file that was checked. */
  let checkedAccdb: string | null = null;

  /** A generated file of this CR, by file name (the UI never sends paths). */
  const generatedFile = async (crimeReportId: string, fileName: string) => {
    assertCan(current().role, 'cr.read');
    for (const e of await need(documents, 'documents').history(crimeReportId)) {
      if (e.fileName === fileName) return e.filePath;
      if (e.pdfPath && basename(e.pdfPath) === fileName) return e.pdfPath;
    }
    throw new NotAvailableError('document');
  };

  const backupAdmin = () => {
    assertCan(current().role, 'admin');
    return need(opts.backup, 'backup');
  };
  const recordBackup = (action: 'backup' | 'backup_restore', after: unknown) =>
    repos.audit.record({
      userId: sessions.get()?.userId ?? null,
      action,
      table: 'backups',
      rowId: null,
      before: null,
      after,
    });
  const afterBackup = async () => {
    if (opts.filesDir) await cleanOrphanFiles(repos.files, opts.filesDir);
  };
  const restoreFrom = async (dir: string) => {
    const backup = backupAdmin();
    await backup.restore(dir);
    await recordBackup('backup_restore', { from: basename(dir) });
    opts.onRestored?.();
  };

  /** Called by the main-process timer: makes the daily backup when one is due. */
  const runScheduledBackup = async () => {
    if (!opts.backup || !(await opts.backup.isDue(new Date()))) return null;
    const info = await opts.backup.backupNow('auto');
    await recordBackup('backup', info);
    await afterBackup();
    return info;
  };

  // Until a new or reset user has changed their password, only these channels work.
  const sessionFree = {
    'auth.login': (username: string, password: string) => auth.login(username, password),
    'auth.logout': () => auth.logout(),
    'auth.currentSession': () => auth.currentSession(),
    'auth.changePassword': (oldPassword: string, newPassword: string) =>
      auth.changePassword(oldPassword, newPassword),
    'auth.needsFirstUser': () => auth.needsFirstUser(),
    'auth.createFirstUser': (username: string, password: string) =>
      auth.createFirstUser(username, password),
  };

  const gated = {
    'auth.createUser': (...a: Parameters<typeof auth.createUser>) => auth.createUser(...a),
    'auth.unlockUser': (userId: string) => auth.unlockUser(userId),

    'users.list': () => users.list(),
    'users.setActive': (userId: string, active: boolean) => users.setActive(userId, active),
    'users.resetPassword': (userId: string, temporaryPassword: string) =>
      users.resetPassword(userId, temporaryPassword),

    'reference.list': (...a: Parameters<typeof reference.list>) => reference.list(...a),
    'reference.add': (...a: Parameters<typeof reference.add>) => reference.add(...a),
    'reference.rename': (...a: Parameters<typeof reference.rename>) => reference.rename(...a),
    'reference.setActive': (id: string, active: boolean) => reference.setActive(id, active),
    'reference.remove': (id: string) => reference.remove(id),
    'reference.usageCount': (id: string) => reference.usageCount(id),

    'audit.search': (...a: Parameters<typeof auditQuery.search>) => auditQuery.search(...a),

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

    'files.attach': async (crimeReportId: string) => {
      assertCan(current().role, 'cr.write');
      const path = await need(opts.pickOpenPath, 'dialog')('picture');
      return path ? need(files, 'files').attach(crimeReportId, path) : null;
    },
    'files.list': (crimeReportId: string) => need(files, 'files').list(crimeReportId),
    'files.preview': (id: string) => need(files, 'files').preview(id),
    'files.remove': (id: string) => need(files, 'files').remove(id),
    'files.open': async (id: string) => {
      await need(opts.openPath, 'shell')(await need(files, 'files').pathOf(id));
    },

    'documents.listFor': (crimeReportId: string) =>
      need(documents, 'documents').listFor(crimeReportId),
    'documents.generate': async (
      crimeReportId: string,
      templateId: string,
      options: { pdf?: boolean },
    ) => {
      const result = await need(documents, 'documents').generate(
        crimeReportId,
        templateId,
        options,
      );
      await repos.audit.record({
        userId: current().userId,
        action: 'document_generate',
        table: 'documents',
        rowId: crimeReportId,
        before: null,
        after: {
          templateId,
          fileName: result.fileName,
          warnings: result.warnings.map((w) => w.code),
        },
      });
      return result;
    },
    'documents.history': async (crimeReportId: string) => {
      assertCan(current().role, 'cr.read');
      return need(documents, 'documents').history(crimeReportId);
    },
    'documents.open': async (crimeReportId: string, fileName: string) => {
      await need(opts.openPath, 'shell')(await generatedFile(crimeReportId, fileName));
    },
    'documents.showInFolder': async (crimeReportId: string, fileName: string) => {
      need(opts.showItemInFolder, 'shell')(await generatedFile(crimeReportId, fileName));
    },

    'print.certificateE48': (...a: Parameters<DefaultPrintService['certificateE48']>) =>
      need(print, 'print').certificateE48(...a),
    'print.convictsList': (...a: Parameters<DefaultPrintService['convictsList']>) =>
      need(print, 'print').convictsList(...a),
    'print.register': (...a: Parameters<DefaultPrintService['register']>) =>
      need(print, 'print').register(...a),

    'backup.settings': () => backupAdmin().settings(),
    'backup.updateSettings': (patch: BackupSettingsInput) => backupAdmin().updateSettings(patch),
    /** The main process asks for the folder; returns the new settings, or null when cancelled. */
    'backup.chooseFolder': async () => {
      const backup = backupAdmin();
      const folder = await need(opts.pickFolder, 'dialog')('backup');
      return folder ? backup.updateSettings({ folder }) : null;
    },
    'backup.now': async () => {
      const info = await backupAdmin().backupNow('manual');
      await recordBackup('backup', info);
      await afterBackup();
      return info;
    },
    'backup.list': () => backupAdmin().listBackups(),
    'backup.verify': async (name: string) => {
      const backup = backupAdmin();
      return backup.verify(await backup.resolve(name));
    },
    /** Replaces all data with a listed backup; the app restarts afterwards. */
    'backup.restore': async (name: string) => {
      await restoreFrom(await backupAdmin().resolve(name));
      return true;
    },
    /** Restore from a backup folder elsewhere (e.g. a USB drive on a new PC). */
    'backup.restoreFromFolder': async () => {
      const backup = backupAdmin();
      const dir = await need(opts.pickFolder, 'dialog')('restore');
      if (!dir) return null;
      const check = await backup.verify(dir);
      if (check.ok) await restoreFrom(dir);
      return check;
    },

    /** Asks for the Access file, then checks it without saving anything. Null when cancelled. */
    'import.dryRun': async () => {
      assertCan(current().role, 'admin');
      const svc = need(importer, 'import');
      const path = await need(opts.pickOpenPath, 'dialog')('accdb');
      if (!path) return null;
      const report = await svc.dryRun(path);
      checkedAccdb = path;
      return report;
    },
    /** Imports the file of the last dry run. */
    'import.run': async () => {
      assertCan(current().role, 'admin');
      if (!checkedAccdb) throw new NotAvailableError('dry_run_first');
      return need(importer, 'import').run(checkedAccdb);
    },
    'import.lastReport': () => need(importer, 'import').lastReport(),
    /** Saves the last report as CSV where the user chooses; returns the path or null. */
    'import.saveReport': async () => {
      const report = await need(importer, 'import').lastReport(); // checks the role
      if (!report) throw new NotAvailableError('report');
      const path = await opts.pickSavePath('import-report.csv');
      if (path) await writeFile(path, reportCsv(report), 'utf8');
      return path;
    },

    'support.showLogFile': async () => {
      need(opts.showItemInFolder, 'shell')(need(opts.logFile, 'log'));
    },
  } satisfies Record<string, (...args: never[]) => Promise<unknown>>;

  const handlers = { ...sessionFree, ...guard(gated, sessions) };
  return { handlers, sessions, runScheduledBackup };
}

/** Wraps every handler so it refuses to run while the password must be changed. */
function guard<T extends Record<string, (...args: never[]) => Promise<unknown>>>(
  fns: T,
  sessions: SessionHolder,
): T {
  const out: Record<string, (...args: never[]) => Promise<unknown>> = {};
  for (const [name, fn] of Object.entries(fns)) {
    out[name] = async (...args: never[]) => {
      if (sessions.get()?.mustChangePassword) throw new LoginError('password_change_required');
      return fn(...args);
    };
  }
  return out as T;
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
