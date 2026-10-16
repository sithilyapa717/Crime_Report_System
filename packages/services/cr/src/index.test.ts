import { randomUUID } from 'node:crypto';
import type { CrRepository, Session } from '@excise/contract';
import type { CrimeReport, CrimeReportInput, Role } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import { CrConflictError, CrValidationError, DefaultCrService } from './index.js';

class MemoryCrRepo implements CrRepository {
  rows = new Map<string, CrimeReport>();
  async insert(input: CrimeReportInput) {
    const now = new Date().toISOString();
    const row: CrimeReport = { ...input, id: randomUUID(), version: 1, createdAt: now, updatedAt: now, deleted: false };
    this.rows.set(row.id, row);
    return row;
  }
  async update(id: string, v: number, input: CrimeReportInput) {
    const cur = this.rows.get(id);
    if (!cur || cur.version !== v) return null;
    const row = { ...cur, ...input, version: v + 1 };
    this.rows.set(id, row);
    return row;
  }
  async getById(id: string) { return this.rows.get(id) ?? null; }
  async findByNumber(o: string, y: number, n: string) {
    return [...this.rows.values()].find((r) => r.officeId === o && r.crYear === y && r.crNumber === n) ?? null;
  }
  async setDeleted(id: string, deleted: boolean) {
    const cur = this.rows.get(id);
    if (cur) this.rows.set(id, { ...cur, deleted });
  }
}

const session = (role: Role): (() => Session) => () => ({ userId: 'u', username: 'u', role });

const input = (): CrimeReportInput => ({
  officeId: randomUUID(),
  crYear: 2026,
  crNumber: '1/2026',
  month: 1,
  halfYear: 'first',
  offenceTypeId: randomUUID(),
  detectionDate: '2026-01-02',
  accused: { name: 'Test' },
  supportOfficers: [],
  seizedItems: [],
  cashNotes: [],
  productions: [],
});

describe('CrService', () => {
  it('creates and rejects duplicate CR numbers per office and year', async () => {
    const svc = new DefaultCrService(new MemoryCrRepo(), session('detecting'));
    const i = input();
    await svc.create(i);
    await expect(svc.create(i)).rejects.toBeInstanceOf(CrValidationError);
  });
  it('blocks observation officers from writing', async () => {
    const svc = new DefaultCrService(new MemoryCrRepo(), session('observation'));
    await expect(svc.create(input())).rejects.toThrow(/lacks permission/);
  });
  it('rejects year mismatch', async () => {
    const svc = new DefaultCrService(new MemoryCrRepo(), session('oic'));
    await expect(svc.create({ ...input(), crNumber: '1/2025' })).rejects.toBeInstanceOf(CrValidationError);
  });
  it('detects stale updates', async () => {
    const svc = new DefaultCrService(new MemoryCrRepo(), session('oic'));
    const i = input();
    const saved = await svc.create(i);
    await svc.update(saved.id, 1, i);
    await expect(svc.update(saved.id, 1, i)).rejects.toBeInstanceOf(CrConflictError);
  });
});
