import { assertCan } from '@excise/auth';
import type {
  ConvictFilter,
  ConvictRow,
  CrListRow,
  CrQueryRepository,
  CrSearchFilter,
  SearchService,
  Session,
} from '@excise/contract';
import { IsoDate } from '@excise/schemas';
import { isValidNic } from '@excise/validation';

export class SearchInputError extends Error {
  constructor(public readonly code: string) {
    super(`Invalid search: ${code}`);
  }
}

/** Trim, collapse spaces; returns undefined for empty input. */
function cleanName(name?: string): string | undefined {
  const s = name?.trim().replace(/\s+/g, ' ');
  return s ? s : undefined;
}

/** NICs are stored upper-case (`V`/`X`). */
function cleanNic(nic?: string): string | undefined {
  const s = nic?.trim().toUpperCase();
  if (!s) return undefined;
  if (!isValidNic(s)) throw new SearchInputError('bad_nic');
  return s;
}

const byCrNumber = (a: CrListRow, b: CrListRow) =>
  a.crYear - b.crYear || Number(a.crNumber.split('/')[0]) - Number(b.crNumber.split('/')[0]);

export class DefaultSearchService implements SearchService {
  constructor(
    private readonly queries: CrQueryRepository,
    private readonly session: () => Session,
  ) {}

  async crimeReports(filter: CrSearchFilter): Promise<CrListRow[]> {
    assertCan(this.session().role, 'search');
    let f: CrSearchFilter = filter;
    if (f.kind === 'court_date' || f.kind === 'detection_date') {
      if (!IsoDate.safeParse(f.date).success) throw new SearchInputError('bad_date');
    } else if (f.kind === 'court_case') {
      const caseNumber = f.caseNumber.trim();
      if (!caseNumber) throw new SearchInputError('case_number_required');
      f = { ...f, caseNumber };
    } else if (f.kind === 'name_nic') {
      const name = cleanName(f.name);
      const nic = cleanNic(f.nic);
      if (!name && !nic) throw new SearchInputError('name_or_nic_required');
      f = { kind: 'name_nic', name, nic };
    }
    // The old registers list CRs by running number (`snocr`).
    return (await this.queries.search(f)).sort(byCrNumber);
  }

  async convicts(filter: ConvictFilter): Promise<ConvictRow[]> {
    assertCan(this.session().role, 'search');
    return this.queries.convicts({ ...filter, name: cleanName(filter.name), nic: cleanNic(filter.nic) });
  }

  async previousOffences(query: { name?: string; nic?: string; courtId?: string }): Promise<ConvictRow[]> {
    assertCan(this.session().role, 'search');
    const name = cleanName(query.name);
    const nic = cleanNic(query.nic);
    if (!name && !nic) throw new SearchInputError('name_or_nic_required');
    const rows = await this.queries.convicts({ name, nic, courtId: query.courtId });
    return rows.sort((a, b) => (a.convictedDate ?? '').localeCompare(b.convictedDate ?? ''));
  }
}
