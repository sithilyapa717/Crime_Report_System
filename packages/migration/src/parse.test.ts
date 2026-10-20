import { describe, expect, it } from 'vitest';
import {
  parseCrNumber,
  parseDate,
  parseFlag,
  parseHalfYear,
  parseMoneyCents,
  parseMonth,
  parseNic,
  parseNumber,
  parseSex,
} from './parse.js';

const val = <T>(p: { ok: true; value: T } | { ok: false }) => (p.ok ? p.value : 'FAIL');

describe('legacy value parsers', () => {
  it('dates: real Access dates and year-first text; ambiguous day-first fails', () => {
    expect(val(parseDate('2026-01-02T00:00:00'))).toBe('2026-01-02');
    expect(val(parseDate('2026.01.02'))).toBe('2026-01-02');
    expect(val(parseDate('2026.1.2.'))).toBe('2026-01-02');
    expect(val(parseDate('2026/12/31'))).toBe('2026-12-31');
    expect(val(parseDate('25.03.2026'))).toBe('2026-03-25'); // only one reading
    expect(val(parseDate('03.03.2026'))).toBe('2026-03-03');
    expect(val(parseDate('02.03.2026'))).toBe('FAIL'); // 2 March or 3 February
    expect(val(parseDate('2026.02.30'))).toBe('FAIL');
    expect(val(parseDate('yesterday'))).toBe('FAIL');
    expect(val(parseDate(''))).toBe('FAIL');
  });

  it('numbers and money', () => {
    expect(val(parseNumber('1,500.50'))).toBe(1500.5);
    expect(val(parseNumber(3.5))).toBe(3.5);
    expect(val(parseNumber('750 ml'))).toBe('FAIL');
    expect(val(parseMoneyCents('1,500.50'))).toBe(150050);
    expect(val(parseMoneyCents(25000))).toBe(2500000);
    expect(val(parseMoneyCents('1.234'))).toBe('FAIL'); // fractions of a cent
    expect(val(parseMoneyCents(-5))).toBe('FAIL');
  });

  it('flags, NICs and CR numbers', () => {
    expect([true, -1, 'Yes', 0, false, null, ''].map((v) => val(parseFlag(v)))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(val(parseFlag('maybe'))).toBe('FAIL');
    expect(val(parseNic(' 851234567v '))).toBe('851234567V');
    expect(val(parseNic('199012345678'))).toBe('199012345678');
    expect(val(parseNic('85123456'))).toBe('FAIL');
    expect(val(parseCrNumber('12/2026', 2026))).toEqual({ crNumber: '12/2026', crYear: 2026 });
    expect(val(parseCrNumber('012 / 2025', undefined))).toEqual({
      crNumber: '12/2025',
      crYear: 2025,
    });
    expect(val(parseCrNumber('7', 2024))).toEqual({ crNumber: '7/2024', crYear: 2024 });
    expect(val(parseCrNumber('7', undefined))).toBe('FAIL');
    expect(val(parseCrNumber('12/2026', 2025))).toBe('FAIL');
  });

  it('months, half-years and sex in the words staff used', () => {
    expect([3, '3', 'March', 'mar', 'ජූනි'].map((v) => val(parseMonth(v)))).toEqual([
      3, 3, 3, 3, 6,
    ]);
    expect(val(parseMonth('13'))).toBe('FAIL');
    expect(val(parseHalfYear('පළමු අඩවසර'))).toBe('first');
    expect(val(parseHalfYear('දෙවන අඩවසර'))).toBe('second');
    expect(val(parseHalfYear('අඩවසර'))).toBe('FAIL');
    expect(val(parseSex('පුරුෂ'))).toBe('male');
    expect(val(parseSex('ස්ත්‍රී'))).toBe('female');
  });
});
