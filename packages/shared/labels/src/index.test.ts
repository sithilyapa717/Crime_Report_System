import { describe, expect, it } from 'vitest';
import { LABELS, label } from './index.js';

describe('labels', () => {
  it('shows Sinhala when known, English otherwise, and the key when unknown', () => {
    expect(label('menu.reports')).toBe('වාර්තා');
    expect(label('report.col.crNumber')).toBe('CR number');
    expect(label('no.such.key')).toBe('no.such.key');
  });

  it('has no empty captions', () => {
    for (const [key, { si, en }] of Object.entries(LABELS)) {
      expect(en.trim(), key).not.toBe('');
      if (si !== null) expect(si.trim(), key).not.toBe('');
    }
  });
});
