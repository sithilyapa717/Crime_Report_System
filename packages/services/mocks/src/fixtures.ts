// Sample reference data and CRs for tests and for running the app on mocks.
// Names are placeholders, not real officers; A's seed data replaces them.
import type { CaseInput, CrimeReportInput } from '@excise/schemas';
import type { MemoryStore } from './index.js';

export interface SampleRefs {
  office: string;
  offencePuds: string;
  offenceUpg: string;
  detectingOfficer: string;
  informant: string;
  otherOfficer: string;
  court: string;
  otherCourt: string;
  prosecutor: string;
}

export function seedReferences(store: MemoryStore): SampleRefs {
  return {
    office: store.addRef({ name: 'Negombo' }),
    offencePuds: store.addRef({ name: 'Illegal spirit possession', code: 'PUDS' }),
    offenceUpg: store.addRef({ name: 'Cannabis possession', code: 'UPG' }),
    detectingOfficer: store.addRef({ name: 'Officer One' }),
    informant: store.addRef({ name: 'Officer Two' }),
    otherOfficer: store.addRef({ name: 'Officer Three' }),
    court: store.addRef({ name: 'Negombo Magistrate Court' }),
    otherCourt: store.addRef({ name: 'Colombo Magistrate Court' }),
    prosecutor: store.addRef({ name: 'Prosecutor One' }),
  };
}

export function sampleCrInput(
  refs: SampleRefs,
  overrides: Partial<CrimeReportInput> = {},
): CrimeReportInput {
  return {
    officeId: refs.office,
    crYear: 2026,
    crNumber: '1/2026',
    month: 1,
    halfYear: 'first',
    offenceTypeId: refs.offencePuds,
    detectionDate: '2026-01-02',
    place: 'Kochchikade',
    detectingOfficerId: refs.detectingOfficer,
    informantId: refs.informant,
    quantityText: '3.5 L',
    accused: { name: 'Sample Accused', address: 'No 1, Negombo', nic: '851234567V' },
    supportOfficers: [],
    seizedItems: [{ itemType: 'spirit', quantity: 3.5, unit: 'L' }],
    cashNotes: [],
    productions: [],
    ...overrides,
  };
}

export function sampleCaseInput(
  crimeReportId: string,
  refs: SampleRefs,
  overrides: Partial<CaseInput> = {},
): CaseInput {
  return {
    crimeReportId,
    courtId: refs.court,
    courtDate: '2026-01-10',
    prosecutingOfficerId: refs.prosecutor,
    caseNumber: 'B/101/26',
    caseType: 'trial',
    sithasi: false,
    permissionPending: false,
    withdrawn: false,
    accusedDied: false,
    hearings: [],
    outcomes: [],
    rewardVoucherReceived: false,
    ...overrides,
  };
}
