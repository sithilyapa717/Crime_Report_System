// Argument shapes for every IPC channel. The renderer is untrusted input: arguments are checked
// here before any service runs. Record bodies (CR, case) are passed through as `unknown` because
// their services parse them and report field-level issues the forms can show.
import {
  ConvictFilter,
  CrNumber,
  CrSearchFilter,
  ExportFormat,
  PreviousOffenceQuery,
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

export const ARG_SCHEMAS = {
  'auth.login': z.tuple([Text, Text]),
  'auth.logout': z.tuple([]),
  'auth.currentSession': z.tuple([]),
  'auth.changePassword': z.tuple([Text, Text]),
  'auth.createUser': z.tuple([Text, Text, Role]),
  'auth.unlockUser': z.tuple([Uuid]),

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
} satisfies Record<Channel, z.ZodTypeAny>;
