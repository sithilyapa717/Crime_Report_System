// Sample reference data and CRs for tests and for running the app on mocks.
// Names are placeholders, not real officers; A's seed data replaces them.
import type { ReferenceRepository } from '@excise/contract';
import type { CaseInput, CrimeReportInput, ReferenceKind } from '@excise/schemas';
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
    office: store.addRef({ kind: 'office', name: 'Negombo' }),
    offencePuds: store.addRef({ kind: 'offence', name: 'Illegal spirit possession', code: 'PUDS' }),
    offenceUpg: store.addRef({ kind: 'offence', name: 'Cannabis possession', code: 'UPG' }),
    detectingOfficer: store.addRef({ kind: 'detecting_officer', name: 'Officer One' }),
    informant: store.addRef({ kind: 'informant', name: 'Officer Two' }),
    otherOfficer: store.addRef({ kind: 'detecting_officer', name: 'Officer Three' }),
    court: store.addRef({ kind: 'court', name: 'Negombo Magistrate Court' }),
    otherCourt: store.addRef({ kind: 'court', name: 'Colombo Magistrate Court' }),
    prosecutor: store.addRef({ kind: 'prosecuting_officer', name: 'Prosecutor One' }),
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
    quantity: 3500,
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

/** The same sample lists through any `ReferenceRepository` (mocks or SQLite). */
export async function seedSampleReferences(r: ReferenceRepository): Promise<SampleRefs> {
  const add = async (kind: ReferenceKind, value: string, code?: string) =>
    (await r.insert(kind, { value, ...(code ? { code } : {}) })).id;
  return {
    office: await add('office', 'Negombo'),
    offencePuds: await add('offence', 'Illegal spirit possession', 'PUDS'),
    offenceUpg: await add('offence', 'Cannabis possession', 'UPG'),
    detectingOfficer: await add('detecting_officer', 'Officer One'),
    informant: await add('informant', 'Officer Two'),
    otherOfficer: await add('detecting_officer', 'Officer Three'),
    court: await add('court', 'Negombo Magistrate Court'),
    otherCourt: await add('court', 'Colombo Magistrate Court'),
    prosecutor: await add('prosecuting_officer', 'Prosecutor One'),
  };
}
