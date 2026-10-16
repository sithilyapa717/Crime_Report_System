import { assertCan } from '@excise/auth';
import type { CaseRepository, CrRepository, DocDataService, ReferenceLookup, Session } from '@excise/contract';
import type { CaseRecord, CrimeReport } from '@excise/schemas';

/** Old Access format for dates in documents: `YYYY.MM.DD`. */
export const formatDate = (iso?: string | null): string => (iso ? iso.replaceAll('-', '.') : '');

/** Cents to rupees with thousands separators: 150050 -> "1,500.50". */
export const formatMoney = (cents?: number | null): string =>
  cents === undefined || cents === null
    ? ''
    : (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatNumber = (n?: number) => (n === undefined ? '' : String(n));

/**
 * Merge fields whose meaning is not settled yet. They are returned empty until D and B agree
 * on them in packages/documents/mapping (D2).
 */
export const UNRESOLVED_FIELDS = ['type'] as const;

export class DocDataNotFoundError extends Error {}

export class DefaultDocDataService implements DocDataService {
  constructor(
    private readonly crs: CrRepository,
    private readonly cases: CaseRepository,
    private readonly refs: ReferenceLookup,
    private readonly session: () => Session,
  ) {}

  async buildFor(crimeReportId: string): Promise<Record<string, string>> {
    assertCan(this.session().role, 'documents.generate');
    const cr = await this.crs.getById(crimeReportId);
    if (!cr || cr.deleted) throw new DocDataNotFoundError(crimeReportId);
    const c = await this.cases.getByCrimeReport(crimeReportId);
    return buildFields(cr, c, await this.names(cr, c));
  }

  private async names(cr: CrimeReport, c: CaseRecord | null) {
    const name = async (id?: string) => (id ? ((await this.refs.name(id)) ?? '') : '');
    const support: string[] = [];
    for (let pos = 1; pos <= 10; pos++) {
      support.push(await name(cr.supportOfficers.find((s) => s.position === pos)?.officerId));
    }
    return {
      office: await name(cr.officeId),
      offenceCode: (await this.refs.offence(cr.offenceTypeId))?.code ?? '',
      detecting: await name(cr.detectingOfficerId),
      informant: await name(cr.informantId),
      ac: await name(cr.acId),
      sc: await name(cr.scId),
      oic: await name(cr.oicId),
      driver: await name(cr.driverId),
      court: await name(c?.courtId),
      prosecutor: await name(c?.prosecutingOfficerId),
      support,
    };
  }
}

type Names = Awaited<ReturnType<DefaultDocDataService['names']>>;

/** Every merge field found in the original templates (docs/document-catalogue/MERGE_FIELDS.md). */
export function buildFields(cr: CrimeReport, c: CaseRecord | null, n: Names): Record<string, string> {
  const s = (v?: string | null) => v ?? '';
  const cash = (kind: 'used' | 'left', denomination: number) =>
    formatNumber(cr.cashNotes.find((x) => x.kind === kind && x.denomination === denomination)?.count);
  const fine = c?.outcomes.find((o) => o.outcomeType === 'fine');
  const convicted = c?.outcomes.find((o) => o.convictedDate)?.convictedDate;
  const warrant = c?.hearings.find((h) => h.kind === 'warrant')?.date;
  const beer = cr.seizedItems.find((i) => i.itemType === 'beer')?.quantity;

  const crNo = cr.crNumber;
  const courtDate = formatDate(c?.courtDate);
  const detectionDate = formatDate(cr.detectionDate);

  const fields: Record<string, string> = {
    // CR and office
    CR_NO_2017: crNo,
    CR_NO_2015: crNo,
    CR_No: crNo,
    office: n.office,
    Offence: n.offenceCode,
    // Case
    Case_no: s(c?.caseNumber),
    Name_of_Court: n.court,
    Name_of_court: n.court,
    Date_of_Court: courtDate,
    Date_of_court: courtDate,
    Courts_Date: courtDate,
    court_officer: n.prosecutor,
    WT_date: formatDate(warrant),
    result: formatMoney(fine?.fineAmount),
    fine_date: formatDate(convicted),
    // Accused and surety
    Name_of_Accused: cr.accused.name,
    Accused_Name: cr.accused.name,
    Address_of_Accused: s(cr.accused.address),
    Accused_Address: s(cr.accused.address),
    NIC_No_of_Accused: s(cr.accused.nic),
    Name_of_Suerty: s(cr.surety?.name),
    name_of_Suerty: s(cr.surety?.name),
    Address_of_Suerty: s(cr.surety?.address),
    NIC_Suerty: s(cr.surety?.nic),
    // Detection
    Date_of_Detection: detectionDate,
    Detection_Date: detectionDate,
    Place_of_Detection: s(cr.place),
    Informan: n.informant,
    infor_help: s(cr.informantHelp),
    detection_officer: n.detecting,
    Detection_Officer: n.detecting,
    'ග්රහණ_නිළධාරි': n.detecting,
    Ac: n.ac,
    Sc: n.sc,
    oic: n.oic,
    Drive: n.driver,
    // Times
    Time_of_Arraival: s(cr.times?.arrival),
    Time_of_BC_leaving: s(cr.times?.bcLeaving),
    Time_of_IPR_leaving: s(cr.times?.iprLeaving),
    Time_of_Detection: s(cr.times?.detection),
    // Quantities and productions
    Quantity: s(cr.quantityText),
    Quantity_Full: s(cr.quantityText),
    Quantity1: s(cr.quantityExtraText),
    Over_Quantity: s(cr.overQuantityText),
    sp5: beer === undefined ? '' : String(beer),
    Production1: s(cr.productions[1]),
    Production2: s(cr.productions[2]),
    // Cash: "Cash 1000" = notes used; "Cash2 1000" / "Cash3 500" = notes left (old Cash1..Cash7 = 5000..10)
    Cash_1000: cash('used', 1000),
    Cash_500: cash('used', 500),
    Cash_100: cash('used', 100),
    Cash2_1000: cash('left', 1000),
    Cash3_500: cash('left', 500),
    Cash_Number: s(cr.cashSerials),
    Cash_Number_1: s(cr.cashSerials1),
  };
  // Support officers: dh1-dh5 are positions 1-5, inh1-inh5 are positions 6-10.
  for (let i = 0; i < 5; i++) {
    fields[`dh${i + 1}`] = n.support[i] ?? '';
    fields[`inh${i + 1}`] = n.support[i + 5] ?? '';
  }
  for (const f of UNRESOLVED_FIELDS) fields[f] = '';
  return fields;
}
