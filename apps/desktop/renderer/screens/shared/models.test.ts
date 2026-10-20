// The form models must round-trip what the services store: open a CR or case, save without
// changes, and nothing is lost or altered.
import type { CaseRecord, CrimeReport } from '@excise/schemas';
import { describe, expect, it } from 'vitest';
import { caseDraft, caseInput } from '../case-progress/CaseProgressScreen.js';
import { emptyDraft, fromReport, tabOf, toInput } from './cr-model.js';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const cr: CrimeReport = {
  id: ID(1),
  version: 3,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-03T00:00:00Z',
  deleted: false,
  officeId: ID(2),
  crYear: 2026,
  crNumber: '12/2026',
  month: 1,
  halfYear: 'first',
  offenceTypeId: ID(3),
  detectionDate: '2026-01-02',
  place: 'කොච්චිකඩේ',
  detectingOfficerId: ID(4),
  informantId: ID(5),
  notes: 'note',
  quantity: 3500,
  cashFoundPlace: 'shirt pocket',
  accused: { name: 'ඒ. බී. කුමාර', nic: '851234567V', age: 41, sex: 'male' },
  surety: { name: 'Surety', phone: '077' },
  times: { arrival: '14.45' },
  supportOfficers: [
    { officerId: ID(6), position: 1 },
    { officerId: ID(7), position: 8 },
  ],
  seizedItems: [
    { itemType: 'spirit', quantity: 3.5, unit: 'L' },
    { itemType: 'heroin', quantity: 20, unit: 'mg', overQuantity: 5 },
  ],
  cashNotes: [
    { kind: 'used', denomination: 1000, text: 'S/426 672487' },
    { kind: 'left', denomination: 500, text: 'X/1' },
  ],
  productions: ['Bottle 1', '', 'Bottle 3'],
};

const kase: CaseRecord = {
  id: ID(10),
  version: 2,
  updatedAt: '2026-02-01T00:00:00Z',
  crimeReportId: ID(1),
  courtId: ID(11),
  courtDate: '2026-01-10',
  caseNumber: 'B/101/26',
  caseType: 'trial',
  sithasi: false,
  permissionPending: false,
  withdrawn: false,
  accusedDied: false,
  hearings: [
    { kind: 'summons', date: '2026-01-11' },
    { kind: 'warrant', date: '2026-01-12', memo: 'w' },
    { kind: 'trial', date: '2026-02-01', memo: 'postponed' },
    { kind: 'trial', date: '2026-03-01' },
  ],
  outcomes: [
    {
      outcomeType: 'fine',
      fineAmount: 150050,
      convictedDate: '2026-03-01',
      receiptNo: 'R1',
      addToConvictRegister: true,
    },
    {
      outcomeType: 'imprisonment',
      prisonMonths: 6,
      convictedDate: '2026-03-01',
      addToConvictRegister: true,
    },
  ],
  rewardVoucherReceived: true,
  rewardVoucherDate: '2026-03-05',
  register: { volumeNo: '3' },
  handover: { officer: 'SI Silva' },
};

describe('CR form model', () => {
  it('open → save without changes keeps every field', () => {
    const { id: _i, version: _v, createdAt: _c, updatedAt: _u, deleted: _d, ...input } = cr;
    void [_i, _v, _c, _u, _d];
    expect(toInput(fromReport(cr, kase))).toEqual(input);
  });

  it('a new form sends what is filled in, and the service reports the rest', () => {
    const d = emptyDraft({ officeId: ID(2), crYear: 2026, crSeq: 5 });
    const input = toInput({ ...d, accused: { ...d.accused, name: ' X ' } });
    expect(input).toMatchObject({
      crNumber: '5/2026',
      accused: { name: 'X' },
      cashNotes: [],
      productions: [],
    });
    expect(input).not.toHaveProperty('surety');
    expect(input).not.toHaveProperty('offenceTypeId');
  });

  it('service issue paths point at the right tab', () => {
    expect(tabOf('accused.name')).toBe('accused');
    expect(tabOf('cashNotes.0.text')).toBe('cash');
    expect(tabOf('seizedItems.1.quantity')).toBe('seized');
    expect(tabOf('crNumber')).toBe('header');
    expect(tabOf('detectionDate')).toBe('detection');
  });
});

describe('case form model', () => {
  it('open → save without changes keeps every field', () => {
    const { id: _i, version: _v, updatedAt: _u, ...input } = kase;
    void [_i, _v, _u];
    expect(caseInput(kase.crimeReportId, caseDraft(kase))).toEqual(
      expect.objectContaining({ ...input, courtDate: '2026-01-10' }),
    );
    const back = caseInput(kase.crimeReportId, caseDraft(kase));
    expect(back.hearings).toEqual(kase.hearings);
    expect(back.outcomes).toEqual(kase.outcomes);
  });

  it('keeps extra legacy hearings the form has no place for', () => {
    const extra = {
      ...kase,
      hearings: [...kase.hearings, { kind: 'summons' as const, date: '2026-04-01' }],
    };
    expect(caseInput(kase.crimeReportId, caseDraft(extra)).hearings).toContainEqual({
      kind: 'summons',
      date: '2026-04-01',
    });
  });
});
