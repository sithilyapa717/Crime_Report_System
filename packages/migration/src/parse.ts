// Value parsers for legacy Access data. Each returns `{ ok: true, value }` or `{ ok: false }`;
// nothing is ever guessed: an ambiguous value is a failure that goes to the exceptions report.

export type Parsed<T> = { ok: true; value: T } | { ok: false };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = { ok: false } as const;

/** Empty, whitespace-only and null all count as "no value". */
export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function text(v: unknown): string | undefined {
  if (isBlank(v)) return undefined;
  return String(v).trim();
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const back = new Date(`${iso}T00:00:00Z`);
  return back.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * A calendar date. Accepts real Access dates (`2026-01-02T00:00:00` from the reader) and the text
 * forms staff typed: year first (`2026.01.02`, `2026-1-2`, `2026/01/02`). Day-first text
 * (`02.01.2026`) is accepted only when it cannot be read the other way round (day > 12, or day
 * and month equal); otherwise it is ambiguous and fails.
 */
export function parseDate(v: unknown): Parsed<string> {
  const s = text(v);
  if (!s) return fail;
  let m = /^(\d{4})[.\-/ ](\d{1,2})[.\-/ ](\d{1,2})(?:[T ]00:00(?::00)?)?\.?$/.exec(s);
  if (m) {
    const iso = validDate(+m[1]!, +m[2]!, +m[3]!);
    return iso ? ok(iso) : fail;
  }
  m = /^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{4})\.?$/.exec(s);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    if (a !== b && a <= 12 && b <= 12) return fail; // 02.03.2026: 2 March or 3 February?
    const iso =
      a > 12 ? validDate(+m[3]!, b, a) : b > 12 ? validDate(+m[3]!, a, b) : validDate(+m[3]!, b, a);
    return iso ? ok(iso) : fail;
  }
  return fail;
}

/** A plain number; thousands separators allowed (`1,500.50`). */
export function parseNumber(v: unknown): Parsed<number> {
  if (typeof v === 'number') return Number.isFinite(v) ? ok(v) : fail;
  const s = text(v);
  if (!s) return fail;
  const clean = s.replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return fail;
  return ok(Number(clean));
}

export function parseWholeNumber(v: unknown): Parsed<number> {
  const n = parseNumber(v);
  return n.ok && Number.isInteger(n.value) && n.value >= 0 ? n : fail;
}

/** Rupees (number or text) → integer cents. */
export function parseMoneyCents(v: unknown): Parsed<number> {
  const n = parseNumber(v);
  if (!n.ok || n.value < 0) return fail;
  const cents = Math.round(n.value * 100);
  return Math.abs(cents - n.value * 100) < 1e-6 ? ok(cents) : fail;
}

/** Access Yes/No: true/false, -1/0, or the words staff may have typed in a text column. */
export function parseFlag(v: unknown): Parsed<boolean> {
  if (typeof v === 'boolean') return ok(v);
  if (typeof v === 'number') return v === 0 ? ok(false) : v === -1 || v === 1 ? ok(true) : fail;
  const s = text(v)?.toLowerCase();
  if (s === undefined) return ok(false);
  if (['yes', 'true', '-1', '1', 'ඔව්'].includes(s)) return ok(true);
  if (['no', 'false', '0', 'නැත'].includes(s)) return ok(false);
  return fail;
}

/** Old NIC (9 digits + V/X) or new (12 digits); spaces removed, stored upper-case. */
export function parseNic(v: unknown): Parsed<string> {
  const s = text(v)?.replace(/\s+/g, '');
  if (!s) return fail;
  return /^(\d{9}[VvXx]|\d{12})$/.test(s) ? ok(s.toUpperCase()) : fail;
}

/** `n/yyyy`. A bare number takes the CR year (`YearCR`), which is how `snocr` was used. */
export function parseCrNumber(
  v: unknown,
  year: number | undefined,
): Parsed<{ crNumber: string; crYear: number }> {
  const s = text(v);
  if (!s) return fail;
  let m = /^0*([1-9]\d*)\s*\/\s*(\d{4})$/.exec(s);
  if (m) {
    const y = +m[2]!;
    if (year !== undefined && year !== y) return fail; // number says one year, YearCR another
    return ok({ crNumber: `${m[1]}/${y}`, crYear: y });
  }
  m = /^0*([1-9]\d*)$/.exec(s);
  if (m && year !== undefined) return ok({ crNumber: `${m[1]}/${year}`, crYear: year });
  return fail;
}

const MONTHS_EN = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const MONTHS_SI = [
  'ජනවාරි',
  'පෙබරවාරි',
  'මාර්තු',
  'අප්‍රේල්',
  'මැයි',
  'ජූනි',
  'ජූලි',
  'අගෝස්තු',
  'සැප්තැම්බර්',
  'ඔක්තෝබර්',
  'නොවැම්බර්',
  'දෙසැම්බර්',
];

/** Month as a number, an English name or abbreviation, or a Sinhala name. */
export function parseMonth(v: unknown): Parsed<number> {
  const s = text(v);
  if (!s) return fail;
  if (/^\d{1,2}$/.test(s)) {
    const n = +s;
    return n >= 1 && n <= 12 ? ok(n) : fail;
  }
  const lower = s.toLowerCase().replace(/\.$/, '');
  const en = MONTHS_EN.findIndex((m) => m === lower || (lower.length >= 3 && m.startsWith(lower)));
  if (en >= 0) return ok(en + 1);
  const si = MONTHS_SI.indexOf(s.normalize('NFC'));
  return si >= 0 ? ok(si + 1) : fail;
}

/** `fistsecon`: the half chosen at entry (පළමු / දෙවන අඩවසර), or 1/2, first/second. */
export function parseHalfYear(v: unknown): Parsed<'first' | 'second'> {
  const s = text(v)?.toLowerCase();
  if (!s) return fail;
  const first = s.includes('පළමු') || s.includes('පලමු') || s === '1' || s.startsWith('first');
  const second = s.includes('දෙවන') || s.includes('දෙවෙනි') || s === '2' || s.startsWith('second');
  if (first === second) return fail;
  return ok(first ? 'first' : 'second');
}

/** `male female`: පුරුෂ / ස්ත්‍රී, or male/female, M/F. */
export function parseSex(v: unknown): Parsed<'male' | 'female'> {
  const s = text(v)?.toLowerCase();
  if (!s) return fail;
  if (s.includes('පුරුෂ') || s === 'male' || s === 'm') return ok('male');
  if (s.includes('ස්ත්‍රී') || s.includes('ස්ත්රී') || s === 'female' || s === 'f')
    return ok('female');
  return fail;
}
