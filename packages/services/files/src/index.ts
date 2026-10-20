// A9: pictures and other files attached to a CR. Files are copied into the app's data folder under
// a random name, so nothing depends on where the original was; the `files` table links them to
// the CR. The renderer never sees a path: the main process picks the source with its own dialog.
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { assertCan } from '@excise/auth';
import type {
  AuditSink,
  CrRepository,
  FileRepository,
  FileService,
  Session,
  StoredFile,
} from '@excise/contract';

export class FileStoreError extends Error {
  constructor(public readonly code: 'not_found' | 'bad_type' | 'too_large' | 'empty') {
    super(code);
  }
}

/** Types the entry form accepts (open question 5: what pictures are attached is still open). */
export const ALLOWED_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Pictures larger than this are not previewed inline (open them instead). */
export const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

export class DefaultFileService implements FileService {
  constructor(
    private readonly repo: FileRepository,
    private readonly crs: CrRepository,
    /** Folder holding the stored files, e.g. `<userData>/files`. */
    private readonly dir: string,
    private readonly session: () => Session,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async liveCr(crimeReportId: string) {
    const cr = await this.crs.getById(crimeReportId);
    if (!cr || cr.deleted) throw new FileStoreError('not_found');
    return cr;
  }

  private async stored(id: string) {
    const f = await this.repo.get(id);
    if (!f) throw new FileStoreError('not_found');
    return f;
  }

  async attach(crimeReportId: string, sourcePath: string): Promise<StoredFile> {
    assertCan(this.session().role, 'cr.write');
    await this.liveCr(crimeReportId);
    const ext = extname(sourcePath).toLowerCase();
    const mimeType = ALLOWED_TYPES[ext];
    if (!mimeType) throw new FileStoreError('bad_type');
    const { size } = await stat(sourcePath);
    if (size === 0) throw new FileStoreError('empty');
    if (size > MAX_FILE_BYTES) throw new FileStoreError('too_large');

    const id = randomUUID();
    const storedName = `${id}${ext}`;
    await mkdir(this.dir, { recursive: true });
    await copyFile(sourcePath, join(this.dir, storedName));
    const file: StoredFile = {
      id,
      crimeReportId,
      // The name only, never the folder it came from.
      originalName: sourcePath.split(/[\\/]/).pop() ?? storedName,
      mimeType,
      sizeBytes: size,
      createdAt: this.now().toISOString(),
    };
    try {
      await this.repo.insert({ ...file, storedName });
    } catch (e) {
      await rm(join(this.dir, storedName), { force: true });
      throw e;
    }
    await this.audit.record({
      userId: this.session().userId,
      action: 'file_attach',
      table: 'files',
      rowId: id,
      before: null,
      after: file,
    });
    return file;
  }

  async list(crimeReportId: string): Promise<StoredFile[]> {
    assertCan(this.session().role, 'cr.read');
    return this.repo.listFor(crimeReportId);
  }

  async pathOf(id: string): Promise<string> {
    assertCan(this.session().role, 'cr.read');
    return join(this.dir, (await this.stored(id)).storedName);
  }

  async preview(id: string): Promise<string | null> {
    assertCan(this.session().role, 'cr.read');
    const f = await this.stored(id);
    if (!f.mimeType.startsWith('image/') || f.sizeBytes > MAX_PREVIEW_BYTES) return null;
    const data = await readFile(join(this.dir, f.storedName));
    return `data:${f.mimeType};base64,${data.toString('base64')}`;
  }

  async remove(id: string): Promise<void> {
    assertCan(this.session().role, 'cr.write');
    const f = await this.stored(id);
    await this.liveCr(f.crimeReportId);
    await this.repo.setDeleted(id);
    await this.audit.record({
      userId: this.session().userId,
      action: 'file_remove',
      table: 'files',
      rowId: id,
      before: { originalName: f.originalName, crimeReportId: f.crimeReportId },
      after: null,
    });
  }
}

/**
 * Deletes stored files no live record points at (removed attachments, failed inserts). Run after a
 * backup, so a removed picture is still in the last backup. Returns the names deleted.
 */
export async function cleanOrphanFiles(repo: FileRepository, dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const live = await repo.liveStoredNames();
  const orphans = names.filter((n) => !live.has(n));
  for (const n of orphans) await rm(join(dir, n), { force: true });
  return orphans;
}
