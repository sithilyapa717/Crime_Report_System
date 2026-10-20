// A13/A14: the one-time Access import (REWRITE_PLAN §7). OIC only.
//
//   dryRun: reads a copy of the .accdb, transforms every row and reports exceptions, unknown
//           names, column coverage and totals. Writes nothing to the database.
//   run:    the same, then saves the CRs, cases, pictures and new reference items. Rows with a
//           required value missing or unreadable are skipped and listed; fix them in the Access
//           copy and run again (CRs already imported are reported as duplicates, not doubled).
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { assertCan } from '@excise/auth';
import type {
  AuditSink,
  CaseRepository,
  CrRepository,
  FileRepository,
  ImportException,
  ImportReport,
  ImportService,
  ReferenceItem,
  ReferenceRepository,
  Session,
} from '@excise/contract';
import { ALLOWED_TYPES } from '@excise/files';
import type { ReferenceKind } from '@excise/schemas';
import { LOOKUP_TABLES, normalizeColumn, OFFICE_COLUMNS, SKIPPED_TABLES } from './columns.js';
import { isBlank, text } from './parse.js';
import type { AccdbReader, LegacyDatabase, LegacyTable } from './reader/index.js';
import { refKey, transformRow, type RefName, type RowDraft } from './transform.js';

export class ImportError extends Error {
  constructor(public readonly code: 'no_office_table') {
    super(code);
  }
}

export interface ImporterDeps {
  read: AccdbReader;
  references: ReferenceRepository;
  crs: CrRepository;
  cases: CaseRepository;
  files: FileRepository;
  audit: AuditSink;
  /** Picture store (`<userData>/files`). */
  filesDir: string;
  /** Where the last report is kept (JSON). */
  reportFile: string;
  session: () => Session;
  /** All-or-nothing for a real run, when the database layer provides it. */
  transaction?: <T>(fn: () => Promise<T>) => Promise<T>;
  now?: () => Date;
}

const findTable = (db: LegacyDatabase, name: string): [string, LegacyTable] | undefined =>
  Object.entries(db.tables).find(([n]) => normalizeColumn(n) === normalizeColumn(name));

/** Values of a legacy lookup table. Offences have a code column (short ASCII) and a name column. */
export function lookupValues(
  table: LegacyTable,
  kind: ReferenceKind,
): { value: string; code?: string }[] {
  const cols = table.columns.filter((c) => normalizeColumn(c.name) !== 'id');
  const textCols = cols.filter((c) => c.type === 10 || c.type === 12);
  const valuesOf = (col: string) => table.rows.map((r) => text(r[col]));
  if (kind === 'offence') {
    const isCode = (col: string) =>
      valuesOf(col).every((v) => v === undefined || /^[A-Za-z0-9][A-Za-z0-9 ,&/-]{0,19}$/.test(v));
    const codeCol = textCols.find((c) => isCode(c.name));
    const nameCol = textCols.find((c) => c !== codeCol);
    if (!codeCol) return [];
    return table.rows.flatMap((r) => {
      const code = text(r[codeCol.name])?.toUpperCase();
      if (!code) return [];
      return [{ value: (nameCol && text(r[nameCol.name])) || code, code }];
    });
  }
  const col = textCols[0] ?? cols[0];
  if (!col) return [];
  return [...new Set(valuesOf(col.name).filter((v): v is string => !!v))].map((value) => ({
    value,
  }));
}

export class DefaultImportService implements ImportService {
  private readonly now: () => Date;

  constructor(private readonly deps: ImporterDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  dryRun(accdbPath: string): Promise<ImportReport> {
    return this.execute(accdbPath, false);
  }

  run(accdbPath: string): Promise<ImportReport> {
    return this.execute(accdbPath, true);
  }

  async lastReport(): Promise<ImportReport | null> {
    assertCan(this.deps.session().role, 'admin');
    try {
      return JSON.parse(await readFile(this.deps.reportFile, 'utf8')) as ImportReport;
    } catch {
      return null;
    }
  }

  private async execute(accdbPath: string, write: boolean): Promise<ImportReport> {
    const session = this.deps.session();
    assertCan(session.role, 'admin');
    const startedAt = this.now().toISOString();
    const legacy = await this.deps.read(accdbPath);
    const office = findTable(legacy, 'Office');
    if (!office) throw new ImportError('no_office_table');
    const [officeTableName, officeTable] = office;

    // ---- Column coverage (§11: nothing dropped silently) ----
    const known = new Map(OFFICE_COLUMNS.map((c) => [normalizeColumn(c.column), c]));
    const present = new Set(officeTable.columns.map((c) => normalizeColumn(c.name)));
    const notStored: Record<string, number> = {};
    for (const c of OFFICE_COLUMNS) {
      if (!c.target.startsWith('not stored') || !present.has(normalizeColumn(c.column))) continue;
      const actual = officeTable.columns.find(
        (x) => normalizeColumn(x.name) === normalizeColumn(c.column),
      )!.name;
      notStored[c.column] = officeTable.rows.filter((r) => !isBlank(r[actual])).length;
    }
    const columns = {
      unmapped: officeTable.columns
        .map((c) => c.name)
        .filter((n) => !known.has(normalizeColumn(n))),
      missing: OFFICE_COLUMNS.map((c) => c.column).filter((n) => !present.has(normalizeColumn(n))),
      notStored,
    };

    // ---- Lookup tables → reference lists ----
    const lookupRows: Record<string, number> = {};
    const seeds: RefName[] = [];
    for (const { table, kind } of LOOKUP_TABLES) {
      const found = findTable(legacy, table);
      if (!found) continue;
      lookupRows[table] = found[1].rows.length;
      for (const v of lookupValues(found[1], kind as ReferenceKind)) {
        seeds.push({
          kind: kind as ReferenceKind,
          value: v.value,
          ...(v.code ? { code: v.code } : {}),
        });
      }
    }
    for (const t of SKIPPED_TABLES) {
      const found = findTable(legacy, t);
      if (found)
        lookupRows[`${t} (not imported: passwords are never migrated)`] = found[1].rows.length;
    }

    // ---- Rows ----
    const exceptions: ImportException[] = [];
    const drafts: { draft: RowDraft; index: number }[] = [];
    officeTable.rows.forEach((row, index) => {
      const draft = transformRow(row, index, exceptions);
      if (draft) drafts.push({ draft, index });
    });

    const work = async () => {
      const resolver = await this.resolver(
        seeds,
        drafts.map((d) => d.draft),
        write,
      );
      const imported: RowDraft[] = [];
      const seen = new Set<string>();
      let picturesCopied = 0;
      for (const { draft, index } of drafts) {
        const built = draft.build(resolver.idOf);
        exceptions.push(...built.issues);
        if (!built.cr) continue;
        const key = `${built.cr.officeId}|${built.cr.crNumber}`;
        const existing = await this.deps.crs.findByNumber(
          built.cr.officeId,
          built.cr.crYear,
          built.cr.crNumber,
        );
        if (seen.has(key) || existing) {
          exceptions.push({
            row: draft.label,
            column: 'CR NO 2017',
            value: draft.crNumber,
            reason: 'duplicate_cr',
          });
          continue;
        }
        seen.add(key);
        imported.push(draft);
        if (!write) continue;

        const cr = await this.deps.crs.insert(built.cr);
        if (built.case) await this.deps.cases.save({ ...built.case, crimeReportId: cr.id }, null);
        for (const a of legacy.attachments.filter(
          (x) => x.table === officeTableName && x.row === index,
        )) {
          if (await this.copyPicture(cr.id, a.fileName, a.path)) picturesCopied++;
          else
            exceptions.push({
              row: draft.label,
              column: a.field,
              value: a.fileName,
              reason: 'other',
            });
        }
      }
      return { imported, picturesCopied, unverified: resolver.unverified };
    };
    const result =
      write && this.deps.transaction ? await this.deps.transaction(work) : await work();

    const totals: ImportReport['totals'] = {
      crs: 0,
      crsByYear: {},
      finesByYear: {},
      quantityByOffence: {},
    };
    for (const d of result.imported) {
      const y = String(d.crYear);
      totals.crs++;
      totals.crsByYear[y] = (totals.crsByYear[y] ?? 0) + 1;
      if (d.fineCents) totals.finesByYear[y] = (totals.finesByYear[y] ?? 0) + d.fineCents;
      if (d.quantity) {
        totals.quantityByOffence[d.offenceCode] =
          (totals.quantityByOffence[d.offenceCode] ?? 0) + d.quantity;
      }
    }

    const report: ImportReport = {
      mode: write ? 'run' : 'dry_run',
      startedAt,
      finishedAt: this.now().toISOString(),
      rowsRead: officeTable.rows.length,
      imported: result.imported.length,
      skipped: officeTable.rows.length - result.imported.length,
      unverifiedRefs: result.unverified,
      exceptions: dedupe(exceptions),
      totals,
      columns,
      lookupRows,
      picturesCopied: result.picturesCopied,
    };
    await mkdir(dirname(this.deps.reportFile), { recursive: true });
    await writeFile(this.deps.reportFile, JSON.stringify(report, null, 2), 'utf8');
    if (write) {
      // Counts only: the report itself holds names and NICs.
      await this.deps.audit.record({
        userId: session.userId,
        action: 'import',
        table: 'crime_reports',
        rowId: null,
        before: null,
        after: { rowsRead: report.rowsRead, imported: report.imported, skipped: report.skipped },
      });
    }
    return report;
  }

  /**
   * Maps every name to an id. Existing list items are reused (offences by code); names from the
   * legacy lookup tables are added as active items; any other name is "unverified": added as an
   * inactive item for the OIC to review. A dry run hands out temporary ids and adds nothing.
   */
  private async resolver(seeds: RefName[], drafts: RowDraft[], write: boolean) {
    const ids = new Map<string, string>();
    const unverified: { kind: ReferenceKind; value: string }[] = [];
    const offences = new Map<string, ReferenceItem>();
    for (const o of await this.deps.references.list('offence', true))
      if (o.code) offences.set(o.code, o);

    const find = async (r: RefName) =>
      r.kind === 'offence' && r.code
        ? (offences.get(r.code) ?? null)
        : this.deps.references.findByValue(r.kind, r.value);
    const add = async (r: RefName, active: boolean) => {
      if (!write) return randomUUID();
      const item = await this.deps.references.insert(
        r.kind,
        { value: r.value, ...(r.code ? { code: r.code } : {}) },
        active,
      );
      if (item.code) offences.set(item.code, item);
      return item.id;
    };

    for (const s of seeds) {
      if (ids.has(refKey(s))) continue;
      ids.set(refKey(s), (await find(s))?.id ?? (await add(s, true)));
    }
    for (const r of drafts.flatMap((d) => d.refs)) {
      const key = refKey(r);
      if (ids.has(key)) continue;
      const existing = await find(r);
      if (existing) {
        ids.set(key, existing.id);
        continue;
      }
      unverified.push({ kind: r.kind, value: r.value });
      ids.set(key, await add(r, false));
    }
    return {
      unverified,
      idOf: (r: RefName) => {
        const id = ids.get(refKey(r));
        if (!id) throw new Error(`unresolved ${r.kind} ${r.value}`);
        return id;
      },
    };
  }

  private async copyPicture(
    crimeReportId: string,
    fileName: string,
    source: string,
  ): Promise<boolean> {
    const ext = extname(fileName).toLowerCase();
    const mimeType = ALLOWED_TYPES[ext];
    if (!mimeType) return false;
    const id = randomUUID();
    const storedName = `${id}${ext}`;
    await mkdir(this.deps.filesDir, { recursive: true });
    await copyFile(source, join(this.deps.filesDir, storedName));
    const { size } = await stat(source);
    await this.deps.files.insert({
      id,
      crimeReportId,
      originalName: fileName,
      mimeType,
      sizeBytes: size,
      createdAt: this.now().toISOString(),
      storedName,
    });
    return true;
  }
}

function dedupe(list: ImportException[]): ImportException[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = `${e.row}\u0000${e.column}\u0000${e.value}\u0000${e.reason}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
