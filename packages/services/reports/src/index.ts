import { assertCan } from '@excise/auth';
import type {
  ReportColumn,
  ReportParams,
  ReportResult,
  ReportRow,
  ReportRowRepository,
  ReportService,
  ReportType,
  Session,
  SummaryGroup,
  SummaryGroupBy,
} from '@excise/contract';
import { writeCsv, writeXlsx, type LabelResolver } from '@excise/export';
import type { OutcomeType } from '@excise/schemas';

/**
 * Report type filters (REWRITE_PLAN §1.6). The comments give the old Access filter.
 * "resolved" has no single old query; it is read as "the case has an outcome or was closed".
 */
export const TYPE_FILTERS: Record<ReportType, (r: ReportRow) => boolean> = {
  register: () => true,
  warrant: (r) => r.caseType === 'warrant',
  trial: (r) => r.caseType === 'trial',
  summons: (r) => r.caseType === 'summons',
  // Case no IS NULL AND nochage = false AND samatha = false
  not_filed: (r) =>
    r.caseNumber === null && !r.permissionPending && !r.outcomes.includes('settlement'),
  // Case no NOT NULL AND result NULL
  fines_not_collected: (r) => r.caseNumber !== null && r.fineAmount === null,
  // result NOT NULL AND rewardgive = false
  rewards_due: (r) => r.fineAmount !== null && !r.rewardVoucherReceived,
  resolved: (r) => r.outcomes.length > 0 || r.withdrawn || r.accusedDied,
  fines_earned: (r) => r.fineAmount !== null,
  // type = true ("add to convicts register")
  convicts: (r) => r.addToConvictRegister,
};

const col = (key: string): ReportColumn => ({ key, labelKey: `report.col.${key}` });

const REGISTER_COLUMNS = [
  'crNumber',
  'detectionDate',
  'offenceCode',
  'accusedName',
  'accusedAddress',
  'accusedNic',
  'quantityText',
  'detectingOfficerName',
  'informantName',
  'courtName',
  'courtDate',
  'caseNumber',
  'fineAmount',
].map(col);

/** Convicts list columns, in the order of the old printed report. */
const CONVICT_OUTCOME_COLUMNS: [string, OutcomeType][] = [
  ['communityService', 'community_service'],
  ['settlement', 'settlement'],
  ['probation', 'probation'],
  ['rehabilitation', 'rehabilitation'],
  ['governmentFee', 'government_fee'],
  ['imprisonment', 'imprisonment'],
  ['admonished', 'admonished'],
  ['suspendedSentence', 'suspended_sentence'],
];

const CONVICT_COLUMNS = [
  ...[
    'accusedName',
    'offenceCode',
    'quantityText',
    'accusedAddress',
    'courtName',
    'convictedDate',
    'caseNumber',
    'fineAmount',
  ].map(col),
  ...CONVICT_OUTCOME_COLUMNS.map(([key]) => col(key)),
  col('accusedNic'),
];

function byPerson(params: ReportParams) {
  const p = params.person;
  if (p.kind === 'none') return () => true;
  if (p.kind === 'detecting_officer') return (r: ReportRow) => r.detectingOfficerId === p.officerId;
  return (r: ReportRow) => r.informantId === p.officerId;
}

const crSeq = (r: ReportRow) => Number(r.crNumber.split('/')[0]);

function toRow(r: ReportRow, type: ReportType): Record<string, string | number | null> {
  const base: Record<string, string | number | null> = {
    crNumber: r.crNumber,
    detectionDate: r.detectionDate,
    offenceCode: r.offenceCode,
    accusedName: r.accusedName,
    accusedAddress: r.accusedAddress,
    accusedNic: r.accusedNic,
    quantityText: r.quantityText,
    detectingOfficerName: r.detectingOfficerName,
    informantName: r.informantName,
    courtName: r.courtName,
    courtDate: r.courtDate,
    caseNumber: r.caseNumber,
    convictedDate: r.convictedDate,
    fineAmount: r.fineAmount,
  };
  if (type === 'convicts') {
    for (const [key, outcome] of CONVICT_OUTCOME_COLUMNS)
      base[key] = r.outcomes.includes(outcome) ? 1 : null;
  }
  return base;
}

export class DefaultReportService implements ReportService {
  constructor(
    private readonly rows: ReportRowRepository,
    private readonly session: () => Session,
    private readonly label: LabelResolver = (k) => k,
  ) {}

  private async select(params: ReportParams): Promise<ReportRow[]> {
    const role = this.session().role;
    assertCan(role, 'reports.basic');
    if (params.person.kind !== 'none') assertCan(role, 'reports.periodic_by_officer');
    const person = byPerson(params);
    const type = TYPE_FILTERS[params.type];
    const rows = await this.rows.rowsFor(params.scope);
    return rows
      .filter((r) => person(r) && type(r))
      .sort((a, b) => a.crYear - b.crYear || crSeq(a) - crSeq(b));
  }

  async run(params: ReportParams): Promise<ReportResult> {
    const rows = await this.select(params);
    return {
      columns: params.type === 'convicts' ? CONVICT_COLUMNS : REGISTER_COLUMNS,
      rows: rows.map((r) => toRow(r, params.type)),
      fineTotal: rows.reduce((sum, r) => sum + (r.fineAmount ?? 0), 0),
    };
  }

  async summary(params: ReportParams, groupBy: SummaryGroupBy): Promise<SummaryGroup[]> {
    const rows = await this.select(params);
    const groups = new Map<string, SummaryGroup>();
    for (const r of rows) {
      const [key, label] =
        groupBy === 'offence'
          ? [r.offenceCode, r.offenceName]
          : groupBy === 'detecting_officer'
            ? [r.detectingOfficerId ?? '', r.detectingOfficerName ?? '']
            : [r.informantId ?? '', r.informantName ?? ''];
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { key, label, count: 0, quantities: {}, fineTotal: 0 }));
      g.count += 1;
      g.fineTotal += r.fineAmount ?? 0;
      for (const s of r.seized)
        g.quantities[s.itemType] = (g.quantities[s.itemType] ?? 0) + s.quantity;
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  async exportToFile(
    params: ReportParams,
    format: 'xlsx' | 'csv',
    filePath: string,
  ): Promise<string> {
    const result = await this.run(params);
    await (format === 'csv' ? writeCsv : writeXlsx)(result, this.label, filePath);
    return filePath;
  }
}
