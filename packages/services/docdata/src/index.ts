import { assertCan } from '@excise/auth';
import type {
  CaseRepository,
  CrRepository,
  DocDataService,
  ReferenceLookup,
  Session,
} from '@excise/contract';
import type { CaseRecord, CrimeReport } from '@excise/schemas';

/**
 * Merge fields that stay empty on purpose. `type` is the "add to convicts register" Yes/No flag,
 * placed by mistake in the UMA quantity line; empty matches what those documents printed.
 */
export const EMPTY_FIELDS = ['type'] as const;

/** Old cash boxes, in form order: `Cash 5000`..`Cash 10` used, `Cash1 5000`..`Cash7 10` left. */
const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10] as const;

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

/**
 * Every merge field found in the original templates (docs/document-catalogue/MERGE_FIELDS.md),
 * as raw values: ISO dates (`2026-01-02`), money in cents, numbers as digits, text as typed.
 * All formatting for print is done once, in packages/documents/mapping (D).
 * Field names are matched without regard to case, so each name appears once here.
 */
export function buildFields(
  cr: CrimeReport,
  c: CaseRecord | null,
  n: Names,
): Record<string, string> {
  const s = (v?: string | null) => v ?? '';
  const num = (v?: number | null) => (v === undefined || v === null ? '' : String(v));
  const fine = c?.outcomes.find((o) => o.outcomeType === 'fine');
  const convicted = c?.outcomes.find((o) => o.convictedDate)?.convictedDate;
  const warrant = c?.hearings.find((h) => h.kind === 'warrant')?.date;

  const fields: Record<string, string> = {
    // CR and office
    CR_NO_2017: cr.crNumber,
    CR_NO_2015: cr.crNumber,
    CR_No: cr.crNumber,
    office: n.office,
    Offence: n.offenceCode,
    // Case
    Case_no: s(c?.caseNumber),
    Name_of_Court: n.court,
    Date_of_Court: s(c?.courtDate),
    Courts_Date: s(c?.courtDate),
    court_officer: n.prosecutor,
    WT_date: s(warrant),
    result: num(fine?.fineAmount),
    fine_date: s(convicted),
    // Accused and surety
    Name_of_Accused: cr.accused.name,
    Accused_Name: cr.accused.name,
    Address_of_Accused: s(cr.accused.address),
    Accused_Address: s(cr.accused.address),
    NIC_No_of_Accused: s(cr.accused.nic),
    Name_of_Suerty: s(cr.surety?.name),
    Address_of_Suerty: s(cr.surety?.address),
    NIC_Suerty: s(cr.surety?.nic),
    // Detection
    Date_of_Detection: cr.detectionDate,
    Detection_Date: cr.detectionDate,
    Place_of_Detection: s(cr.place),
    Informan: n.informant,
    infor_help: s(cr.informantHelp),
    detection_officer: n.detecting,
    ග්රහණ_නිළධාරි: n.detecting,
    Ac: n.ac,
    Sc: n.sc,
    oic: n.oic,
    Drive: n.driver,
    // Times, as typed
    Time_of_Arraival: s(cr.times?.arrival),
    Time_of_BC_leaving: s(cr.times?.bcLeaving),
    Time_of_IPR_leaving: s(cr.times?.iprLeaving),
    Time_of_Detection: s(cr.times?.detection),
    // Quantities (whole numbers) and productions
    Quantity: num(cr.quantity),
    // GOLD LEAF beedi count; came from the lost `Table1`, same value as Quantity.
    Quantity_Full: num(cr.quantity),
    Quantity1: num(cr.quantityExtra),
    Over_Quantity: num(cr.overQuantity),
    sp5: num(cr.seizedItems.find((i) => i.itemType === 'beer')?.quantity),
    Production: s(cr.productions[0]),
    Production1: s(cr.productions[1]),
    Production2: s(cr.productions[2]),
    // Note serials
    Cash_Number: s(cr.cashSerials),
    Cash_Number_1: s(cr.cashSerials1),
  };

  // The 14 cash boxes, as typed (staff entered note serial numbers in them).
  DENOMINATIONS.forEach((d, i) => {
    const typed = (kind: 'used' | 'left') =>
      s(cr.cashNotes.find((x) => x.kind === kind && x.denomination === d)?.text);
    fields[`Cash_${d}`] = typed('used');
    fields[`Cash${i + 1}_${d}`] = typed('left');
  });

  // Support officers: dh1-dh5 are positions 1-5, inh1-inh5 are positions 6-10.
  for (let i = 0; i < 5; i++) {
    fields[`dh${i + 1}`] = n.support[i] ?? '';
    fields[`inh${i + 1}`] = n.support[i + 5] ?? '';
  }
  for (const f of EMPTY_FIELDS) fields[f] = '';
  return fields;
}
