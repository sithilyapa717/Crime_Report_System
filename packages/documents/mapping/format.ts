// Old-system formats for merged values (D4).
// Formats marked "to confirm" are a best reading of the old data and must be checked
// against a document Word merged from real Access data (Phase 3).

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Date as YYYY.MM.DD, the format staff typed into Access (e.g. 2026.01.01). */
export function formatDate(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('invalid date');
    return `${value.getFullYear()}.${pad(value.getMonth() + 1)}.${pad(value.getDate())}`;
  }
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(value.trim());
  if (!m) throw new Error(`not a date: ${value}`);
  return `${m[1]}.${pad(Number(m[2]))}.${pad(Number(m[3]))}`;
}

/** Time as HH.MM (24-hour). To confirm: the old Access fields were free text. */
export function formatTime(value: Date | string): string {
  if (value instanceof Date) return `${pad(value.getHours())}.${pad(value.getMinutes())}`;
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) throw new Error(`not a time: ${value}`);
  return `${pad(Number(m[1]))}.${m[2]}`;
}

/**
 * Money from integer cents, printed like Access merged a Number field:
 * no thousands separator, decimals only when there are cents (2500000 → "25000").
 * To confirm against a real merged plaint or voucher.
 */
export function formatMoney(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`money must be integer cents: ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  return rest === 0 ? `${sign}${rupees}` : `${sign}${rupees}.${pad(rest)}`;
}

/** Counts and quantities as plain numbers, no grouping (e.g. 330, 1.5). */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`not a number: ${value}`);
  return String(value);
}
