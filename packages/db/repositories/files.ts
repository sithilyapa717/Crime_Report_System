// A9 file links, and D's template registry and generation log as tables (D5/D6).
import type { FileRepository, StoredFile } from '@excise/contract';
import type {
  GenerationLog,
  GenerationLogEntry,
  TemplateEntry,
  TemplateSource,
} from '@excise/documents';
import { sql } from 'kysely';
import type { FilesTable } from '../schema/tables.js';
import type { DbHandle } from '../src/handle.js';
import { created, now } from './common.js';

const toFile = (r: FilesTable): StoredFile => ({
  id: r.id,
  crimeReportId: r.crime_report_id,
  originalName: r.original_name,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  createdAt: r.created_at,
});

export class SqliteFileRepository implements FileRepository {
  constructor(private readonly db: DbHandle) {}

  async insert(file: StoredFile & { storedName: string }) {
    await this.db.q
      .insertInto('files')
      .values({
        ...created(this.db, file.id, file.createdAt),
        crime_report_id: file.crimeReportId,
        original_name: file.originalName,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        stored_name: file.storedName,
      })
      .execute();
  }

  async listFor(crimeReportId: string) {
    const rows = await this.db.q
      .selectFrom('files')
      .selectAll()
      .where('crime_report_id', '=', crimeReportId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at')
      .execute();
    return rows.map(toFile);
  }

  async get(id: string) {
    const r = await this.db.q
      .selectFrom('files')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return r ? { ...toFile(r), storedName: r.stored_name } : null;
  }

  async setDeleted(id: string) {
    const at = now();
    await this.db.q
      .updateTable('files')
      .set({
        deleted_at: at,
        updated_at: at,
        updated_by: this.db.currentUser(),
        version: sql<number>`version + 1`,
      })
      .where('id', '=', id)
      .execute();
  }

  async liveStoredNames() {
    const rows = await this.db.q
      .selectFrom('files')
      .select('stored_name')
      .where('deleted_at', 'is', null)
      .execute();
    return new Set(rows.map((r) => r.stored_name));
  }
}

/** D's registry from the `document_templates` table (seeded once from templates.json). */
export class SqliteTemplateSource implements TemplateSource {
  constructor(private readonly db: DbHandle) {}

  async list(): Promise<TemplateEntry[]> {
    const rows = await this.db.q
      .selectFrom('document_templates')
      .selectAll()
      .where('deleted_at', 'is', null)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      family: r.family as TemplateEntry['family'],
      offenceCodes: JSON.parse(r.offence_codes_json) as string[],
      variant: JSON.parse(r.variant_json) as TemplateEntry['variant'],
      status: r.status as TemplateEntry['status'],
      ...(r.notes ? { notes: r.notes } : {}),
    }));
  }

  /** First start: copies templates.json into the table. Later runs add only new entries. */
  async seed(entries: TemplateEntry[]): Promise<number> {
    const have = new Set(
      (await this.db.q.selectFrom('document_templates').select('id').execute()).map((r) => r.id),
    );
    const fresh = entries.filter((e) => !have.has(e.id));
    for (const e of fresh) {
      await this.db.q
        .insertInto('document_templates')
        .values({
          ...created(this.db, e.id),
          title: e.title,
          family: e.family,
          offence_codes_json: JSON.stringify(e.offenceCodes),
          variant_json: JSON.stringify(e.variant),
          status: e.status,
          notes: e.notes ?? null,
        })
        .execute();
    }
    return fresh.length;
  }
}

/** D's generation log in `generated_documents` (append-only). */
export class SqliteGenerationLog implements GenerationLog {
  constructor(private readonly db: DbHandle) {}

  async append(e: GenerationLogEntry): Promise<void> {
    await this.db.q
      .insertInto('generated_documents')
      .values({
        ...created(this.db, e.id, e.generatedAt),
        crime_report_id: e.crimeReportId,
        cr_number: e.crNumber,
        template_id: e.templateId,
        template_sha256: e.templateSha256,
        file_name: e.fileName,
        file_path: e.filePath,
        sha256: e.sha256,
        pdf_path: e.pdfPath ?? null,
        empty_fields_json: JSON.stringify(e.emptyFields),
        generated_by: e.generatedBy,
        generated_at: e.generatedAt,
      })
      .execute();
  }

  async forCrimeReport(crimeReportId: string): Promise<GenerationLogEntry[]> {
    const rows = await this.db.q
      .selectFrom('generated_documents')
      .selectAll()
      .where('crime_report_id', '=', crimeReportId)
      .orderBy('generated_at')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      crimeReportId: r.crime_report_id,
      crNumber: r.cr_number,
      templateId: r.template_id,
      templateSha256: r.template_sha256,
      fileName: r.file_name,
      filePath: r.file_path,
      sha256: r.sha256,
      generatedBy: r.generated_by,
      generatedAt: r.generated_at,
      emptyFields: JSON.parse(r.empty_fields_json) as string[],
      ...(r.pdf_path ? { pdfPath: r.pdf_path } : {}),
    }));
  }
}
