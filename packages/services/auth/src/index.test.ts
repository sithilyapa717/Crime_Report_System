import { describe, expect, it } from 'vitest';
import { assertCan, can, isLocked, PermissionError } from './index.js';

describe('auth permissions', () => {
  it('only the OIC edits reference lists', () => {
    expect(can('oic', 'reference.edit')).toBe(true);
    for (const r of ['detecting', 'observation', 'supervising'] as const) {
      expect(can(r, 'reference.edit')).toBe(false);
    }
  });
  it('observation officers cannot enter CRs', () => {
    expect(() => assertCan('observation', 'cr.write')).toThrow(PermissionError);
  });
  it('supervising officers get officer reports but cannot write', () => {
    expect(can('supervising', 'reports.periodic_by_officer')).toBe(true);
    expect(can('supervising', 'cr.write')).toBe(false);
  });
  it('locks after 5 failures', () => {
    expect(isLocked(4)).toBe(false);
    expect(isLocked(5)).toBe(true);
  });
});
