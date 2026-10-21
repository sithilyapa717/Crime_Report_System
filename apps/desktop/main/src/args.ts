// Argument shapes for every IPC channel. The renderer is untrusted input: arguments are checked
// here before any service runs. Record bodies (CR, case) are passed through as `unknown` because
// their services parse them and report field-level issues the forms can show.
import {
  AuditFilter,
  BackupName,
  BackupSettingsInput,
  ConvictFilter,
  CrNumber,
  CrSearchFilter,
  ExportFormat,
  PreviousOffenceQuery,
  PrintTarget,
  ReferenceInput,
  ReferenceKind,
  ReportParams,
  Role,
  SummaryGroupBy,
  Uuid,
  z,
} from '@excise/schemas';
import type { Channel } from './host.js';

const Text = z.string().max(200);
const Version = z.number().int().positive();
const Year = z.number().int().min(1990).max(2100);
const Body = z.unknown();
/** Template id: a path under templates/original, as listed by `documents.listFor`. */
const TemplateId = z.string().min(1).max(300);
/** A file name only: no folder separators. */
const FileName = z
  .string()
  .min(1)
  .max(260)
  .regex(/^[^\\/]+$/);

export const ARG_SCHEMAS = {
  'auth.login': z.tuple([Text, Text]),
  'auth.logout': z.tuple([]),
  'auth.currentSession': z.tuple([]),
  'auth.changePassword': z.tuple([Text, Text]),
  'auth.needsFirstUser': z.tuple([]),
  'auth.createFirstUser': z.tuple([Text, Text]),
  'auth.createUser': z.tuple([Text, Text, Role]),
  'auth.unlockUser': z.tuple([Uuid]),

  'users.list': z.tuple([]),
  'users.setActive': z.tuple([Uuid, z.boolean()]),
  'users.resetPassword': z.tuple([Uuid, Text]),

  'reference.list': z.union([
    z.tuple([ReferenceKind]),
    z.tuple([ReferenceKind, z.object({ includeInactive: z.boolean().optional() }).strict()]),
  ]),
  'reference.add': z.tuple([ReferenceKind, ReferenceInput]),
  'reference.rename': z.tuple([Uuid, ReferenceInput]),
  'reference.setActive': z.tuple([Uuid, z.boolean()]),
  'reference.remove': z.tuple([Uuid]),
  'reference.usageCount': z.tuple([Uuid]),

  'audit.search': z.tuple([AuditFilter]),

  'cr.create': z.tuple([Body]),
  'cr.update': z.tuple([Uuid, Version, Body]),
  'cr.get': z.tuple([Uuid]),
  'cr.find': z.tuple([Uuid, Year, CrNumber]),
  'cr.softDelete': z.tuple([Uuid]),
  'cr.restore': z.tuple([Uuid]),

  'case.save': z.tuple([Body, Version.nullable()]),
  'case.getByCrimeReport': z.tuple([Uuid]),

  'search.crimeReports': z.tuple([CrSearchFilter]),
  'search.convicts': z.tuple([ConvictFilter]),
  'search.previousOffences': z.tuple([PreviousOffenceQuery]),

  'reports.run': z.tuple([ReportParams]),
  'reports.summary': z.tuple([ReportParams, SummaryGroupBy]),
  'reports.export': z.tuple([ReportParams, ExportFormat]),

  'docdata.buildFor': z.tuple([Uuid]),

  'files.attach': z.tuple([Uuid]),
  'files.list': z.tuple([Uuid]),
  'files.preview': z.tuple([Uuid]),
  'files.remove': z.tuple([Uuid]),
  'files.open': z.tuple([Uuid]),

  'documents.listFor': z.tuple([Uuid]),
  'documents.generate': z.tuple([
    Uuid,
    TemplateId,
    z.object({ pdf: z.boolean().optional() }).strict(),
  ]),
  'documents.history': z.tuple([Uuid]),
  'documents.open': z.tuple([Uuid, FileName]),
  'documents.showInFolder': z.tuple([Uuid, FileName]),

  'print.certificateE48': z.tuple([PreviousOffenceQuery, PrintTarget]),
  'print.convictsList': z.tuple([ConvictFilter, PrintTarget]),
  'print.register': z.tuple([ReportParams, PrintTarget]),

  'backup.settings': z.tuple([]),
  'backup.updateSettings': z.tuple([BackupSettingsInput.strict()]),
  'backup.chooseFolder': z.tuple([]),
  'backup.now': z.tuple([]),
  'backup.list': z.tuple([]),
  'backup.verify': z.tuple([BackupName]),
  'backup.restore': z.tuple([BackupName]),
  'backup.restoreFromFolder': z.tuple([]),

  'import.dryRun': z.tuple([]),
  'import.run': z.tuple([]),
  'import.lastReport': z.tuple([]),
  'import.saveReport': z.tuple([]),

  'support.fontCheck': z.tuple([]),
  'support.showLogFile': z.tuple([]),
} satisfies Record<Channel, z.ZodTypeAny>;
