// Document generation (D6): one template + one CR's field values → a new .docx in the output
// folder, logged. Called by the Electron main process for the documents dialog (D10).
//
// Safety rules:
//   - the template must be in the registry, not archived, and meant for the CR's offence
//     (unless the caller explicitly allows another offence);
//   - the template file must still match its frozen SHA-256 (MANIFEST.json);
//   - an existing file is never overwritten: a regenerated document gets " (2)", " (3)", …
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fillTemplateFromFields, type FillReport } from '../engine/fill.ts';
import type { TemplateEntry, TemplateRegistry } from '../registry/registry.ts';
import { documentFileName, withCopyNumber } from './filename.ts';
import type { GenerationLog, GenerationLogEntry } from './log.ts';
import type { PdfExporter } from './pdf.ts';

export interface GenerateRequest {
  crimeReportId: string;
  /** "n/yyyy", used in the file name. */
  crNumber: string;
  offenceCode: string;
  templateId: string;
  /** Merge-field values, as returned by DocDataService.buildFor (B8). */
  fields: Record<string, string>;
  /** Session user id, for the log. */
  userId: string;
  /** Generate a template that is registered for a different offence. Default false. */
  allowOtherOffence?: boolean;
  /** Also save a PDF next to the .docx (needs `pdfExporter`). */
  pdf?: boolean;
}

export interface GeneratorDeps {
  registry: TemplateRegistry;
  /** packages/documents/templates/original (holds MANIFEST.json). */
  originalsDir: string;
  outputDir: string;
  log: GenerationLog;
  now?: () => Date;
  /** e.g. exportPdfWithWord; absent = PDF export not offered. */
  pdfExporter?: PdfExporter;
}

export interface GeneratedDocument {
  filePath: string;
  fileName: string;
  template: TemplateEntry;
  report: FillReport;
  /** Shown by the dialog (the UI maps `code` to a Sinhala caption; `detail` is for logs). */
  warnings: GenerationWarning[];
  logEntry: GenerationLogEntry;
}

export type GenerationWarningCode = 'unconfirmed' | 'other_offence' | 'empty_fields' | 'pdf_failed' | 'pdf_unavailable';

export interface GenerationWarning {
  code: GenerationWarningCode;
  detail: string;
}

export class GenerationError extends Error {}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

export class DocumentGenerator {
  private readonly deps: GeneratorDeps;
  private manifest: Map<string, string> | null = null;

  constructor(deps: GeneratorDeps) {
    this.deps = deps;
  }

  /** Whether `pdf: true` can produce a PDF on this computer. */
  get canExportPdf(): boolean {
    return !!this.deps.pdfExporter;
  }

  async generate(req: GenerateRequest): Promise<GeneratedDocument> {
    const { registry, originalsDir, outputDir, log, now = () => new Date() } = this.deps;
    if (!req.crNumber.trim()) throw new GenerationError('the CR has no CR number');
    const template = registry.get(req.templateId);
    if (!template) throw new GenerationError(`unknown template: ${req.templateId}`);
    if (template.status === 'archived') throw new GenerationError(`template is archived: ${template.title}`);
    if (!req.allowOtherOffence && !registry.appliesTo(template, req.offenceCode)) {
      throw new GenerationError(`template ${template.title} is not for offence ${req.offenceCode}`);
    }

    const templateBytes = await readFile(join(originalsDir, template.id));
    const templateSha256 = sha256(templateBytes);
    const expected = (await this.frozenHashes()).get(template.id);
    if (!expected) throw new GenerationError(`template is not in MANIFEST.json: ${template.id}`);
    if (expected !== templateSha256) throw new GenerationError(`template file was changed: ${template.id}`);

    const { docx, report } = fillTemplateFromFields(templateBytes, req.fields);
    // an unsupported field would stay a live field showing the template's old sample value
    if (report.unsupported.length) {
      throw new GenerationError(`template has fields the engine cannot fill: ${report.unsupported.join(', ')}`);
    }

    await mkdir(outputDir, { recursive: true });
    const baseName = documentFileName(req.crNumber, template.title);
    const { filePath, fileName } = await writeNew(outputDir, baseName, docx);

    const warnings: GenerationWarning[] = [];
    const warn = (code: GenerationWarningCode, detail: string) => warnings.push({ code, detail });
    if (template.status === 'unconfirmed') warn('unconfirmed', 'template not yet confirmed as current by staff');
    if (!registry.appliesTo(template, req.offenceCode)) warn('other_offence', `template is for ${template.offenceCodes.join(', ')}`);
    if (report.missing.length) warn('empty_fields', `left empty: ${report.missing.join(', ')}`);

    let pdfPath: string | undefined;
    if (req.pdf) {
      if (!this.deps.pdfExporter) warn('pdf_unavailable', 'PDF export is not available on this computer');
      else {
        try {
          pdfPath = await this.deps.pdfExporter(filePath);
        } catch (e) {
          // the .docx is already saved; a failed PDF must not lose it
          warn('pdf_failed', `PDF not created: ${(e as Error).message}`);
        }
      }
    }

    const logEntry: GenerationLogEntry = {
      id: randomUUID(),
      crimeReportId: req.crimeReportId,
      crNumber: req.crNumber,
      templateId: template.id,
      templateSha256,
      fileName,
      filePath,
      sha256: sha256(docx),
      generatedBy: req.userId,
      generatedAt: now().toISOString(),
      emptyFields: report.missing,
      ...(pdfPath ? { pdfPath } : {}),
    };
    await log.append(logEntry);
    return { filePath, fileName, template, report, warnings, logEntry };
  }

  private async frozenHashes(): Promise<Map<string, string>> {
    if (!this.manifest) {
      const m = JSON.parse(await readFile(join(this.deps.originalsDir, 'MANIFEST.json'), 'utf8')) as {
        files: { path: string; sha256: string }[];
      };
      this.manifest = new Map(m.files.map((f) => [f.path, f.sha256]));
    }
    return this.manifest;
  }
}

/** Writes to a name that does not exist yet ("wx" fails instead of overwriting). */
export async function writeNew(dir: string, baseName: string, data: Buffer): Promise<{ filePath: string; fileName: string }> {
  for (let n = 1; n < 1000; n++) {
    const fileName = withCopyNumber(baseName, n);
    const filePath = join(dir, fileName);
    try {
      await writeFile(filePath, data, { flag: 'wx' });
      return { filePath, fileName };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new GenerationError(`too many copies of ${baseName}`);
}
