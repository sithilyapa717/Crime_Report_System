import { describe, expect, it } from 'vitest';
import { isValidNic, parseCrNumber, validateCrDates, validateOutcomeAllowed } from './index.js';

describe('validation', () => {
  it('accepts old and new NIC formats only', () => {
    expect(isValidNic('851234567V')).toBe(true);
    expect(isValidNic('198512345678')).toBe(true);
    expect(isValidNic('85123456')).toBe(false);
  });
  it('parses CR numbers', () => {
    expect(parseCrNumber('1/2026')).toEqual({ seq: 1, year: 2026 });
    expect(parseCrNumber('1-2026')).toBeNull();
  });
  it('flags future detection date, early hearing and year mismatch', () => {
    const issues = validateCrDates(
      { detectionDate: '2026-05-01', crYear: 2025, crNumber: '3/2026', hearingDates: ['2026-04-01'] },
      '2026-01-01',
    );
    expect(issues.map((i) => i.code).sort()).toEqual([
      'before_detection',
      'future_date',
      'year_mismatch',
    ]);
  });
  it('requires a case number for outcomes', () => {
    expect(validateOutcomeAllowed(undefined, 1)).toHaveLength(1);
    expect(validateOutcomeAllowed('B/12', 1)).toHaveLength(0);
  });
});
