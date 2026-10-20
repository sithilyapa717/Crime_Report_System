// Dates are stored ISO (`2026-01-02`) and shown the way staff write them: `2026.01.02` (§1.8).

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : iso;
}

/** `2026.1.2`, `2026-01-02`, `2026/01/02` → `2026-01-02`; anything else → null. */
export function parseDateInput(text: string): string | null {
  const m = /^\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Rupees with thousands separators, from cents. */
export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
