// A11: the 14 lookup lists. Everyone logged in reads them (every drop-down); only the OIC edits.
// Items are never renamed in the records that use them, because records keep the id.
import { assertCan } from '@excise/auth';
import type {
  AuditSink,
  ReferenceItem,
  ReferenceRepository,
  ReferenceService,
  Session,
} from '@excise/contract';
import { OFFICER_KINDS, ReferenceInput, ReferenceKind } from '@excise/schemas';

export class ReferenceError extends Error {
  constructor(
    public readonly code:
      'not_found' | 'duplicate' | 'duplicate_code' | 'code_required' | 'bad_year' | 'in_use',
  ) {
    super(code);
  }
}

const isOfficer = (kind: ReferenceKind) => (OFFICER_KINDS as readonly string[]).includes(kind);

export class DefaultReferenceService implements ReferenceService {
  constructor(
    private readonly repo: ReferenceRepository,
    private readonly session: () => Session,
    private readonly audit: AuditSink,
  ) {}

  /** Checks one item for its list; drops fields that do not belong to the list. */
  private async check(kind: ReferenceKind, raw: ReferenceInput, exceptId?: string) {
    const input = ReferenceInput.parse(raw);
    if (kind === 'year') {
      const y = Number(input.value);
      if (!/^\d{4}$/.test(input.value) || y < 1990 || y > 2100)
        throw new ReferenceError('bad_year');
    }
    if (kind === 'offence' && !input.code) throw new ReferenceError('code_required');
    const clean: ReferenceInput = {
      value: input.value,
      ...(kind === 'offence' ? { code: input.code } : {}),
      ...(isOfficer(kind) && input.rank ? { rank: input.rank } : {}),
    };

    const same = await this.repo.findByValue(kind, clean.value);
    if (same && same.id !== exceptId) throw new ReferenceError('duplicate');
    if (clean.code) {
      const all = await this.repo.list(kind, true);
      if (all.some((i) => i.code === clean.code && i.id !== exceptId)) {
        throw new ReferenceError('duplicate_code');
      }
    }
    return clean;
  }

  private async existing(id: string): Promise<ReferenceItem> {
    const item = await this.repo.getById(id);
    if (!item) throw new ReferenceError('not_found');
    return item;
  }

  private record(
    action: 'reference_add' | 'reference_update' | 'reference_delete',
    rowId: string,
    before: ReferenceItem | null,
    after: ReferenceItem | null,
  ) {
    return this.audit.record({
      userId: this.session().userId,
      action,
      table: 'reference_items',
      rowId,
      before,
      after,
    });
  }

  async list(kind: ReferenceKind, opts: { includeInactive?: boolean } = {}) {
    this.session(); // any logged-in role
    const k = ReferenceKind.parse(kind);
    if (opts.includeInactive) assertCan(this.session().role, 'reference.edit');
    return this.repo.list(k, !!opts.includeInactive);
  }

  async add(kind: ReferenceKind, input: ReferenceInput) {
    assertCan(this.session().role, 'reference.edit');
    const k = ReferenceKind.parse(kind);
    const saved = await this.repo.insert(k, await this.check(k, input));
    await this.record('reference_add', saved.id, null, saved);
    return saved;
  }

  async rename(id: string, input: ReferenceInput) {
    assertCan(this.session().role, 'reference.edit');
    const before = await this.existing(id);
    const saved = await this.repo.update(id, await this.check(before.kind, input, id));
    if (!saved) throw new ReferenceError('not_found');
    await this.record('reference_update', id, before, saved);
    return saved;
  }

  async setActive(id: string, active: boolean) {
    assertCan(this.session().role, 'reference.edit');
    const before = await this.existing(id);
    if (before.active === active) return;
    await this.repo.setActive(id, active);
    await this.record('reference_update', id, before, { ...before, active });
  }

  async remove(id: string) {
    assertCan(this.session().role, 'reference.edit');
    const before = await this.existing(id);
    if ((await this.repo.usageCount(id)) > 0) throw new ReferenceError('in_use');
    await this.repo.delete(id);
    await this.record('reference_delete', id, before, null);
  }

  async usageCount(id: string) {
    assertCan(this.session().role, 'reference.edit');
    await this.existing(id);
    return this.repo.usageCount(id);
  }
}
