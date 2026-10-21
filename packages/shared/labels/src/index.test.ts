import { describe, expect, it } from 'vitest';
import { LABELS, label } from './index.js';

describe('labels', () => {
  it('shows Sinhala, and the key when unknown', () => {
    expect(label('menu.reports')).toBe('වාර්තා');
    expect(label('report.col.crNumber')).toBe('අපරාධ වාර්තා අංකය');
    expect(label('no.such.key')).toBe('no.such.key');
  });

  it('has a Sinhala caption for every key, so no English shows in the app', () => {
    const sinhala = /[඀-෿]/;
    // the Tamil line of the trilingual title is the only caption that is not Sinhala
    const missing = Object.entries(LABELS)
      .filter(([key, { si }]) => key !== 'start.titleTamil' && !(si && sinhala.test(si)))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it('has no empty captions', () => {
    for (const [key, { si, en }] of Object.entries(LABELS)) {
      expect(en.trim(), key).not.toBe('');
      if (si !== null) expect(si.trim(), key).not.toBe('');
    }
  });
});
