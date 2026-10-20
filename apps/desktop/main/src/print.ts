// Printing D's fixed layouts (D9): previous-conviction certificate ඊ 48, convicts list, registers.
// Electron-free: the main process supplies `PrintOutput`, which renders the HTML in a hidden
// window and sends it to the printer or saves a PDF.
import type {
  ConvictFilter,
  PreviousOffenceQuery,
  PrintService,
  PrintTarget,
  ReferenceLookup,
  ReportParams,
  ReportService,
  SearchService,
} from '@excise/contract';
import {
  MONTHS,
  renderCertificateE48,
  renderConvictsList,
  renderRegister,
  type PrintLayout,
} from '@excise/documents';

/** Prints or saves one layout; returns the PDF path, `true` when printed, or null when cancelled. */
export type PrintOutput = (
  layout: PrintLayout,
  target: PrintTarget,
  defaultName: string,
) => Promise<string | boolean | null>;

export class PrintError extends Error {
  constructor(public readonly code: 'no_rows' | 'year_required') {
    super(code);
  }
}

export class DefaultPrintService implements PrintService {
  constructor(
    private readonly search: SearchService,
    private readonly reports: ReportService,
    private readonly refs: ReferenceLookup,
    private readonly label: (key: string) => string,
    private readonly output: PrintOutput,
  ) {}

  async certificateE48(query: PreviousOffenceQuery, target: PrintTarget) {
    const rows = await this.search.previousOffences(query); // checks role and input
    if (!rows.length) throw new PrintError('no_rows');
    return this.output(renderCertificateE48(rows), target, 'certificate-E48.pdf');
  }

  async convictsList(filter: ConvictFilter, target: PrintTarget) {
    if (!filter.year) throw new PrintError('year_required');
    const rows = await this.search.convicts(filter);
    const officeName = filter.officeId ? await this.refs.name(filter.officeId) : null;
    const layout = renderConvictsList(rows, {
      year: filter.year,
      ...(filter.month ? { month: filter.month } : {}),
      ...(officeName ? { officeName } : {}),
    });
    const suffix = filter.month
      ? `${filter.year}-${String(filter.month).padStart(2, '0')}`
      : filter.year;
    return this.output(layout, target, `convicts-${suffix}.pdf`);
  }

  async register(params: ReportParams, target: PrintTarget) {
    const result = await this.reports.run(params); // checks role and input
    const { scope } = params;
    const office = await this.refs.name(scope.officeId);
    const period =
      scope.kind === 'month'
        ? `${scope.year} ${MONTHS[scope.month - 1] ?? scope.month}`
        : scope.kind === 'half_year'
          ? `${scope.year} ${this.label(`cr.halfYear.${scope.half}`)}`
          : String(scope.year);
    const person =
      params.person.kind === 'none' ? null : await this.refs.name(params.person.officerId);
    const layout = renderRegister(result, {
      title: this.label(`reportType.${params.type}`),
      subtitle: [office, period, person].filter((s): s is string => !!s),
      caption: this.label,
    });
    return this.output(layout, target, `report-${params.type}-${scope.year}.pdf`);
  }
}
