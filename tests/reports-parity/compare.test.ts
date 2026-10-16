import { describe, expect, it } from 'vitest';
import { compareReports, normalize, parseCsv } from './compare.js';

describe('report parity tools', () => {
  it('normalises dates, numbers and blanks from Access', () => {
    expect(normalize('2026.01.02')).toBe('2026-01-02');
    expect(normalize('2026/1/2')).toBe('2026-01-02');
    expect(normalize('25,000')).toBe('25000');
    expect(normalize(25000)).toBe('25000');
    expect(normalize('  ')).toBe('');
    expect(normalize(null)).toBe('');
  });

  it('reads an Access CSV export', () => {
    const rows = parseCsv(
      String.fromCharCode(0xfeff) +
        'CR NO 2017,Name of Accused,result\r\n1/2026,"Perera, K",25000\r\n',
    );
    expect(rows).toEqual([
      { 'CR NO 2017': '1/2026', 'Name of Accused': 'Perera, K', result: '25000' },
    ]);
  });

  it('reports missing, extra and different rows', () => {
    const oldRows = parseCsv('CR NO 2017,result\n1/2026,25000\n2/2026,1000\n');
    const newRows = [
      { crNumber: '1/2026', fine: 25000 },
      { crNumber: '3/2026', fine: 500 },
    ];
    const r = compareReports(oldRows, newRows, 'CR NO 2017', {
      'CR NO 2017': 'crNumber',
      result: 'fine',
    });
    expect(r).toEqual({ missing: ['2/2026'], extra: ['3/2026'], mismatched: [] });

    const changed = compareReports(
      oldRows.slice(0, 1),
      [{ crNumber: '1/2026', fine: 2500 }],
      'CR NO 2017',
      {
        'CR NO 2017': 'crNumber',
        result: 'fine',
      },
    );
    expect(changed.mismatched).toEqual([
      { key: '1/2026', column: 'result', old: '25000', new: '2500' },
    ]);
  });
});
