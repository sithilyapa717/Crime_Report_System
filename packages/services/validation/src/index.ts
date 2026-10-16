import { CrNumber, Nic } from '@excise/schemas';

export interface ValidationIssue {
  field: string;
  code: string;
}

export function isValidNic(value: string): boolean {
  return Nic.safeParse(value).success;
}

/** Parse `n/yyyy` into its parts; returns null when the format is wrong. */
export function parseCrNumber(value: string): { seq: number; year: number } | null {
  if (!CrNumber.safeParse(value).success) return null;
  const [seq, year] = value.split('/');
  return { seq: Number(seq), year: Number(year) };
}

/** §4.3 cross-field rules for a CR. Dates are ISO `YYYY-MM-DD`; `today` is injectable for tests. */
export function validateCrDates(
  input: { detectionDate: string; crYear: number; crNumber: string; hearingDates?: string[] },
  today: string = new Date().toISOString().slice(0, 10),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.detectionDate > today) issues.push({ field: 'detectionDate', code: 'future_date' });
  for (const h of input.hearingDates ?? []) {
    if (h < input.detectionDate) issues.push({ field: 'hearingDates', code: 'before_detection' });
  }
  const parsed = parseCrNumber(input.crNumber);
  if (!parsed) issues.push({ field: 'crNumber', code: 'bad_format' });
  else if (parsed.year !== input.crYear) issues.push({ field: 'crNumber', code: 'year_mismatch' });
  return issues;
}

/** A CR with no case number cannot receive an outcome (§4.3). */
export function validateOutcomeAllowed(
  caseNumber: string | undefined,
  outcomeCount: number,
): ValidationIssue[] {
  return outcomeCount > 0 && !caseNumber?.trim()
    ? [{ field: 'caseNumber', code: 'required_for_outcome' }]
    : [];
}
