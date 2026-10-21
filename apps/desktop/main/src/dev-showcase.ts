// More dummy data for trying the app in mock mode (`EXCISE_MOCK=1`): Sinhala officers, courts and
// offences from the UI prototype and 18 CRs over 2025-2026 with cases, outcomes, pictures-free
// records, sureties, times and decoy cash. All people and places are made up. Added on top of
// `seedDev`, which the tests rely on and which stays exactly as it was.
import type { CaseInput, CrimeReportInput, OutcomeInput, ReferenceKind } from '@excise/schemas';
import type { Repositories } from './host.js';
import type { SampleRefs } from '@excise/mocks';

const NAMES = [
  'කේ. ඒ. සමන් කුමාර',
  'ඩබ්. ජී. නිමල් පෙරේරා',
  'එස්. එම්. රංජිත් සිල්වා',
  'පී. එල්. සුනිල් ප්‍රනාන්දු',
  'ආර්. ඩී. කමල් ජයසිංහ',
  'එන්. බී. දිලිනි පෙරේරා',
  'ටී. එස්. අනුර බණ්ඩාර',
  'එම්. ඩී. රවින්ද්‍ර සිල්වා',
  'ජේ. පී. චමින්ද ප්‍රේමදාස',
  'එච්. කේ. ලක්ෂාන් ප්‍රනාන්දු',
  'ඒ. ජී. සම්පත් රණසිංහ',
  'බී. එම්. තරංග දිසානායක',
];
const ADDRESSES = [
  'නො. 12, පල්ලන්සේන, මීගමුව',
  'නො. 45/2, කටුනායක',
  'නො. 7, ජා-ඇල',
  'නො. 101, වත්තල පාර, ජා-ඇල',
  'නො. 3, ගොනවල, කටාන',
  'නො. 58, බෝපිටිය, මීගමුව',
];

/** [code, name, seized item, quantity, unit] */
const OFFENCES: [
  string,
  string,
  CrimeReportInput['seizedItems'][number]['itemType'],
  number,
  string,
][] = [
  ['UST', 'බලපතුයක් නොමැතිව මහ රා විකිණීම', 'toddy', 45, 'L'],
  ['USFL', 'බලපත්‍රයක් නොමැතිව බියර් විකිණිම', 'beer', 12, 'L'],
  ['UPT', 'බලපතුයක් නොමැතිව අනුමත සීමාව ඉක්මවා මහ රා ලගතබාගැනීම', 'toddy', 60, 'L'],
  ['UPH', 'ඩයිඇසිටයිල් මොෆින් හෙවත් හෙරොයින් ලගතබාගැනීම', 'heroin', 250, 'mg'],
  ['UMA', 'නිති විරෝධිලෙස නිෂ්පාදනාගාරයක් පවත්වා ගැනීම', 'kasippu', 30, 'L'],
  ['PUML', 'නිති විරෝධිලෙස සාදන ලද මත්පැන් ලගතබාගැනීම', 'kasippu', 25, 'L'],
  ['PDFC', 'බදු නොගෙවන ලද සිගරට් ලග තබාගැනීම', 'cigarettes', 200, ''],
  ['UMB', 'නීති විරෝධිලෙස බීඩි නිෂ්පාදනය කිරීම', 'beedi', 1500, ''],
];

const COURTS = [
  'මහේස්ත්‍රාත් අධිකරණය – මීගමුව',
  'මහේස්ත්‍රාත් අධිකරණය – ගම්පහ',
  'මහේස්ත්‍රාත් අධිකරණය – කටුනායක',
];
const OFFICERS = [
  'ඒ. ඩී. පෙරේරා (IPR)',
  'එස්. කේ. ප්‍රනාන්දු (IPR)',
  'ආර්. එම්. සිල්වා (IPR)',
  'ටී. ජී. ජයසිංහ (සැරයන්)',
];
const INFORMANTS = ['ඩබ්. ඒ. රණසිංහ', 'එන්. පී. කුමාර', 'කේ. එල්. ප්‍රේමරත්න'];
const PROSECUTORS = ['එම්. එස්. ගුණවර්ධන', 'පී. ආර්. දිසානායක'];
const SUPPORT = [
  'ඩී. එම්. ජයතිලක',
  'ජේ. කේ. අබේසිංහ',
  'එච්. ඩබ්. නානායක්කාර',
  'එස්. පී. වික්‍රමසිංහ',
];
const POLICE = ['මීගමුව', 'කටුනායක', 'ජා-ඇල'];
const SECRETARIATS = ['මීගමුව', 'කටාන', 'ජා-ඇල', 'වත්තල'];

const pad = (n: number) => String(n).padStart(2, '0');
const date = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export async function seedShowcase(repos: Repositories, base: SampleRefs): Promise<void> {
  const add = async (kind: ReferenceKind, value: string, code?: string) =>
    (await repos.references.insert(kind, { value, ...(code ? { code } : {}) })).id;
  const addAll = (kind: ReferenceKind, values: string[]) =>
    Promise.all(values.map((v) => add(kind, v)));

  const officers = await addAll('detecting_officer', OFFICERS);
  const informants = await addAll('informant', INFORMANTS);
  const courts = await addAll('court', COURTS);
  const prosecutors = await addAll('prosecuting_officer', PROSECUTORS);
  const support = await addAll('support_officer', SUPPORT);
  const police = await addAll('police_area', POLICE);
  const secretariats = await addAll('divisional_secretariat', SECRETARIATS);
  const ac = await add('ac', 'ඒ. බී. සමරසිංහ');
  const sc = await add('sc', 'සී. ඩී. විජේරත්න');
  const oic = await add('oic', 'එන්. ඩබ්. නයනප්‍රිය');
  const driver = await add('driver', 'ආර්. ජී. සේනානායක');
  const offences = await Promise.all(OFFENCES.map(([code, name]) => add('offence', name, code)));

  const results: OutcomeInput[][] = [
    [{ outcomeType: 'fine', fineAmount: 750000, addToConvictRegister: true }],
    [{ outcomeType: 'fine', fineAmount: 1500000, addToConvictRegister: true }],
    [{ outcomeType: 'imprisonment', prisonMonths: 6, addToConvictRegister: true }],
    [{ outcomeType: 'community_service', addToConvictRegister: true }],
    [{ outcomeType: 'suspended_sentence', prisonMonths: 12, addToConvictRegister: true }],
    [{ outcomeType: 'settlement', addToConvictRegister: false }],
    [{ outcomeType: 'acquitted', addToConvictRegister: false }],
    [],
  ];

  for (let i = 0; i < 18; i++) {
    const crYear = i < 8 ? 2025 : 2026;
    const seq = i < 8 ? i + 1 : i - 8 + 3; // 1/2026 and 2/2026 already exist
    const month = (i * 5) % 12 || 12;
    const day = 3 + ((i * 7) % 24);
    const o = i % OFFENCES.length;
    const [code, , itemType, qty, unit] = OFFENCES[o]!;
    const cash = ['UST', 'USFL', 'UPT'].includes(code);
    const input: CrimeReportInput = {
      officeId: base.office,
      crYear,
      crNumber: `${seq}/${crYear}`,
      month,
      halfYear: month <= 6 ? 'first' : 'second',
      offenceTypeId: offences[o]!,
      detectionDate: date(crYear, month, day),
      place: ADDRESSES[(i + 2) % ADDRESSES.length]!,
      policeAreaId: police[i % police.length]!,
      divisionalSecretariatId: secretariats[i % secretariats.length]!,
      detectingOfficerId: officers[i % officers.length]!,
      informantId: informants[i % informants.length]!,
      acId: ac,
      scId: sc,
      oicId: oic,
      driverId: driver,
      quantity: Math.round(qty * (unit === 'L' ? 1000 : 1)),
      accused: {
        name: NAMES[i % NAMES.length]!,
        address: ADDRESSES[i % ADDRESSES.length]!,
        nic:
          i % 2
            ? `${850000000 + i * 7919}`.slice(0, 9) + 'V'
            : `19${85 + (i % 10)}5${1000000 + i * 7919}`.slice(0, 12),
        age: 25 + i * 2,
        height: `5'${4 + (i % 7)}`,
        sex: i % 6 === 3 ? 'female' : 'male',
        phone: `07${10000000 + i * 91723}`.slice(0, 10),
      },
      ...(i % 4 === 1
        ? {
            surety: {
              name: 'ඩී. එම්. කරුණාරත්න',
              address: 'නො. 9, මීගමුව',
              nic: '197612345678',
              phone: '0771234567',
            },
          }
        : {}),
      times: {
        arrival: '14.30',
        bcLeaving: '14.40',
        iprLeaving: '14.45',
        detection: '14.50',
        afterDetection: '15.30',
      },
      supportOfficers: support
        .slice(0, 1 + (i % 3))
        .map((officerId, k) => ({ officerId, position: k + 1 })),
      seizedItems: [{ itemType, quantity: qty, unit }],
      cashNotes: cash
        ? [
            { kind: 'used', denomination: 1000, text: `S/426 ${672480 + i}` },
            { kind: 'used', denomination: 500, text: `K/118 ${203310 + i}` },
            { kind: 'left', denomination: 100, text: `A/77 ${440120 + i}` },
          ]
        : [],
      productions: [`${code} – සාක්ෂි භාණ්ඩ ${seq}`],
    };
    const cr = await repos.crs.insert(input);

    if (i % 6 === 5) continue; // not filed in court yet
    const caseType = (['trial', 'warrant', 'summons'] as const)[i % 3]!;
    const courtMonth = Math.min(12, month + 1);
    const outcomes = results[i % results.length]!.map((r) => ({
      ...r,
      convictedDate: date(crYear, Math.min(12, courtMonth + 1), day),
      ...(r.outcomeType === 'fine'
        ? {
            receiptNo: `R/${2000 + i}`,
            receiptDate: date(crYear, Math.min(12, courtMonth + 1), day),
          }
        : {}),
    }));
    const hearings: CaseInput['hearings'] = [
      { kind: caseType, date: date(crYear, courtMonth, day), memo: 'නඩුව කැදවීම' },
      { kind: 'trial', date: date(crYear, Math.min(12, courtMonth + 1), day), memo: 'සාක්ෂි' },
    ];
    const caseInput: CaseInput = {
      crimeReportId: cr.id,
      courtId: courts[i % courts.length]!,
      courtDate: date(crYear, courtMonth, day),
      prosecutingOfficerId: prosecutors[i % prosecutors.length]!,
      caseNumber: `B/${1000 + i * 37}/${String(crYear).slice(2)}`,
      caseType,
      sithasi: i % 7 === 2,
      permissionPending: false,
      withdrawn: false,
      accusedDied: false,
      hearings: hearings.slice(0, 1 + (i % 2)),
      outcomes,
      rewardVoucherReceived: i % 4 === 0 && outcomes.length > 0,
      register: outcomes.length
        ? {
            volumeNo: String(1 + (i % 3)),
            volumePage: String(10 + i),
            indexPage: String(2 + (i % 5)),
            indexSn: String(i + 1),
          }
        : undefined,
    };
    await repos.cases.save(caseInput, null);
  }
}
