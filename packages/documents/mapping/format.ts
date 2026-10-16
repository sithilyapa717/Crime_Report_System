// Old-system formats for merged values (D4).
// Formats marked "to confirm" are a best reading of the old data and must be checked
// against a document Word merged from real Access data (Phase 3).
// Every formatter rejects impossible values: a court document must never print "2026.13.45".

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function realDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); // last day of month m
  return d <= days;
}

/** Date as YYYY.MM.DD, the format staff typed into Access (e.g. 2026.01.01). */
export function formatDate(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('invalid date');
    return `${value.getFullYear()}.${pad(value.getMonth() + 1)}.${pad(value.getDate())}`;
  }
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(value.trim());
  if (!m) throw new Error(`not a date: ${value}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!realDate(y, mo, d)) throw new Error(`not a real date: ${value}`);
  return `${m[1]}.${pad(mo)}.${pad(d)}`;
}

/** Time as HH.MM (24-hour). To confirm: the old Access fields were free text. */
export function formatTime(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('invalid time');
    return `${pad(value.getHours())}.${pad(value.getMinutes())}`;
  }
  const m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(value.trim());
  if (!m) throw new Error(`not a time: ${value}`);
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || min > 59 || s > 59) throw new Error(`not a real time: ${value}`);
  return `${pad(h)}.${pad(min)}`;
}

/**
 * Money from integer cents, printed like Access merged a Number field:
 * no thousands separator, decimals only when there are cents (2500000 → "25000").
 * To confirm against a real merged plaint or voucher.
 */
export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`money must be integer cents: ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  return rest === 0 ? `${sign}${rupees}` : `${sign}${rupees}.${pad(rest)}`;
}

/**
 * Counts and quantities as plain numbers, no grouping (e.g. 330, 1.5).
 * Rounded to 6 decimals so floating-point noise (0.1 + 0.2) never reaches a document.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`not a number: ${value}`);
  const rounded = Number(value.toFixed(6));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
