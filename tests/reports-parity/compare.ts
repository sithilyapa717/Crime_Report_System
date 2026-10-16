// Compares an old Access report (exported to CSV) with the new report engine's rows (B10).
// Waiting for real data: see README.md in this folder.

export type Row = Record<string, string | number | null>;

export interface ParityResult {
  /** Keys in the old report but not the new one. */
  missing: string[];
  /** Keys in the new report but not the old one. */
  extra: string[];
  /** Same key, different value in a compared column. */
  mismatched: { key: string; column: string; old: string; new: string }[];
}

/**
 * Makes values from both sides comparable: trims text, treats empty as null, reads
 * `2026.01.02` / `2026/01/02` as `2026-01-02`, and compares numbers numerically.
 */
export function normalize(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  const date = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(s);
  if (date) return `${date[1]}-${date[2]!.padStart(2, '0')}-${date[3]!.padStart(2, '0')}`;
  if (s !== '' && /^-?[\d,]+(\.\d+)?$/.test(s)) return String(Number(s.replaceAll(',', '')));
  return s;
}

/**
 * `columns` maps old column name -> new column key. Rows are matched on `key` (old name).
 * Money must already be in the same unit on both sides (convert cents before calling).
 */
export function compareReports(
  oldRows: Row[],
  newRows: Row[],
  key: string,
  columns: Record<string, string>,
): ParityResult {
  const newKey = columns[key] ?? key;
  const byKey = (rows: Row[], k: string) => new Map(rows.map((r) => [normalize(r[k]), r]));
  const oldMap = byKey(oldRows, key);
  const newMap = byKey(newRows, newKey);

  const result: ParityResult = { missing: [], extra: [], mismatched: [] };
  for (const [k, oldRow] of oldMap) {
    const newRow = newMap.get(k);
    if (!newRow) {
      result.missing.push(k);
      continue;
    }
    for (const [oldCol, newCol] of Object.entries(columns)) {
      const a = normalize(oldRow[oldCol]);
      const b = normalize(newRow[newCol]);
      if (a !== b) result.mismatched.push({ key: k, column: oldCol, old: a, new: b });
    }
  }
  for (const k of newMap.keys()) if (!oldMap.has(k)) result.extra.push(k);
  return result;
}

/** Byte-order mark Excel and Access put at the start of UTF-8 files. */
const BOM = String.fromCharCode(0xfeff);

/** Minimal CSV reader for Access exports (quoted fields, doubled quotes, CRLF, BOM). */
export function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  const s = text.startsWith(BOM) ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      record.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }
  const [header, ...rows] = records.filter((r) => r.some((f) => f !== ''));
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? null])));
}
