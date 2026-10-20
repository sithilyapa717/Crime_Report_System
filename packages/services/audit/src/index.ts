// A10: the audit viewer (OIC only). Writing the log is `AuditSink`, implemented in packages/db.
import { assertCan } from '@excise/auth';
import type {
  AuditQueryRepository,
  AuditQueryService,
  AuditRecord,
  Session,
} from '@excise/contract';
import { AuditFilter } from '@excise/schemas';

export class DefaultAuditQueryService implements AuditQueryService {
  constructor(
    private readonly repo: AuditQueryRepository,
    private readonly session: () => Session,
  ) {}

  async search(filter: AuditFilter): Promise<AuditRecord[]> {
    assertCan(this.session().role, 'admin');
    const f = AuditFilter.parse(filter);
    if (f.from && f.to && f.from > f.to) return [];
    return this.repo.search(f);
  }
}
