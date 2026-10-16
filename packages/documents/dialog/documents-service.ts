// What the documents dialog ("ලේඛන සාදන්න", D10) needs from the main process. B exposes these
// three calls over IPC (proposed channels: documents.listFor, documents.generate, documents.history);
// the React dialog only renders what they return. No wording here: the UI maps the `family`,
// `status` and warning `code` values to captions from packages/shared/labels.
import type { DocDataService, Session } from '../../shared/contract/src/index.ts';
import type { DocumentGenerator } from '../generation/generate.ts';
import type { GenerationLog, GenerationLogEntry } from '../generation/log.ts';
import type { TemplateEntry, TemplateFamily, TemplateRegistry, TemplateVariant } from '../registry/registry.ts';

export interface DialogTemplate {
  id: string;
  title: string;
  status: TemplateEntry['status'];
  variant: TemplateVariant;
  notes?: string;
}

export interface DialogGroup {
  family: TemplateFamily;
  templates: DialogTemplate[];
}

export interface DialogData {
  crimeReportId: string;
  crNumber: string;
  offenceCode: string;
  /** Families in a fixed order: the CR's own plaints first, then vouchers, warrant papers, … */
  groups: DialogGroup[];
  /** Earlier generations for this CR, newest first. */
  history: GenerationLogEntry[];
  pdfAvailable: boolean;
}

export type WarningCode = 'unconfirmed' | 'other_offence' | 'empty_fields' | 'pdf_failed' | 'pdf_unavailable';

export interface DialogResult {
  filePath: string;
  fileName: string;
  pdfPath?: string;
  warnings: { code: WarningCode; detail: string }[];
}

export interface DocumentsServiceDeps {
  docData: DocDataService;
  generator: DocumentGenerator;
  registry: TemplateRegistry;
  log: GenerationLog;
  session: () => Session;
}

const FAMILY_ORDER: TemplateFamily[] = [
  'plaint',
  'charge-sheet',
  'reward-voucher',
  'motion-sheet',
  'warrant-extension',
  'previous-record',
  'production',
  'other',
];

/** Map generator warnings (English, for logs) to stable codes for the UI. */
function warningCode(text: string): WarningCode {
  if (/not yet confirmed/.test(text)) return 'unconfirmed';
  if (/^template is for /.test(text)) return 'other_offence';
  if (/^left empty/.test(text)) return 'empty_fields';
  if (/not available/.test(text)) return 'pdf_unavailable';
  return 'pdf_failed';
}

export class DocumentsService {
  private readonly deps: DocumentsServiceDeps;

  constructor(deps: DocumentsServiceDeps) {
    this.deps = deps;
  }

  /** Templates offered for a CR, grouped by family, plus its generation history. */
  async listFor(crimeReportId: string): Promise<DialogData> {
    const fields = await this.deps.docData.buildFor(crimeReportId); // also checks the role may generate
    const offenceCode = (fields.Offence ?? '').toUpperCase();
    const offered = this.deps.registry.forOffence(offenceCode);
    const groups = FAMILY_ORDER.map((family) => ({
      family,
      templates: offered
        .filter((e) => e.family === family)
        .map(({ id, title, status, variant, notes }) => ({ id, title, status, variant, ...(notes ? { notes } : {}) })),
    })).filter((g) => g.templates.length);
    return {
      crimeReportId,
      crNumber: fields.CR_NO_2017 ?? '',
      offenceCode,
      groups,
      history: await this.history(crimeReportId),
      pdfAvailable: this.deps.generator.canExportPdf,
    };
  }

  async generate(crimeReportId: string, templateId: string, options: { pdf?: boolean } = {}): Promise<DialogResult> {
    const fields = await this.deps.docData.buildFor(crimeReportId);
    const result = await this.deps.generator.generate({
      crimeReportId,
      crNumber: fields.CR_NO_2017 ?? '',
      offenceCode: (fields.Offence ?? '').toUpperCase(),
      templateId,
      fields,
      userId: this.deps.session().userId,
      ...(options.pdf ? { pdf: true } : {}),
    });
    return {
      filePath: result.filePath,
      fileName: result.fileName,
      ...(result.logEntry.pdfPath ? { pdfPath: result.logEntry.pdfPath } : {}),
      warnings: result.warnings.map((w) => ({ code: warningCode(w), detail: w })),
    };
  }

  async history(crimeReportId: string): Promise<GenerationLogEntry[]> {
    const entries = await this.deps.log.forCrimeReport(crimeReportId);
    return [...entries].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }
}
