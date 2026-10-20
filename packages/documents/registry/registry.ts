// Template registry (D5): which frozen templates exist, which offence each serves, its variant,
// and whether staff confirmed it as the current version.
//
// Today the entries live in registry/templates.json (seeded by scripts/seed-registry.ts, then
// maintained by hand). A's `document_templates` table replaces that file later through the same
// `TemplateSource` interface, so the documents dialog and the generator do not change.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type TemplateFamily =
  | 'plaint' // plaint / charge sheet for an offence (පැමිණිලි, චෝදනා)
  | 'charge-sheet'
  | 'reward-voucher' // REWARDS: fines, community service, settlement, voucher ඊ 6c
  | 'motion-sheet'
  | 'warrant-extension'
  | 'previous-record' // previous offences / "no previous offence" notes
  | 'production' // bringing productions (සාක්ෂි භාණ්ඩ)
  | 'other';

/**
 * - unconfirmed: not yet reviewed by staff (§10 Q3); can be generated, the dialog shows a warning
 * - current: the version staff use
 * - archived: an old copy; never offered, never generated
 */
export type TemplateStatus = 'unconfirmed' | 'current' | 'archived';

export interface TemplateVariant {
  container?: 'bottle' | 'can';
  sample?: boolean;
  volumeMl?: number;
  noteRs?: number;
  offences?: number;
}

export interface TemplateEntry {
  /** Stable id: the path under templates/original (unique, never reused). */
  id: string;
  /** Display name: the original file name without .docx (Sinhala kept as is). */
  title: string;
  family: TemplateFamily;
  /**
   * Offence codes this template is for. Empty means "any offence" for general documents
   * (vouchers, motion sheets, …) but "offence not known yet" for plaints and charge sheets,
   * which are then not offered until a code is set.
   */
  offenceCodes: string[];
  variant: TemplateVariant;
  status: TemplateStatus;
  /** Free-text notes for reviewers (e.g. "offence to confirm", "looks like a copy of …"). */
  notes?: string;
}

/** Families written for one offence; without offence codes they are not offered. */
export const OFFENCE_SPECIFIC: TemplateFamily[] = ['plaint', 'charge-sheet'];

export interface TemplateSource {
  list(): Promise<TemplateEntry[]>;
}

/**
 * registry/templates.json next to this file. When the package is bundled into the Electron main
 * process `import.meta.dirname` is not set; the main process then passes its own path.
 */
export const REGISTRY_FILE = join(import.meta.dirname ?? '.', 'templates.json');

/** Reads registry/templates.json. */
export class JsonTemplateSource implements TemplateSource {
  private readonly file: string;

  constructor(file: string = REGISTRY_FILE) {
    this.file = file;
  }

  async list(): Promise<TemplateEntry[]> {
    return (JSON.parse(readFileSync(this.file, 'utf8')) as { templates: TemplateEntry[] }).templates;
  }
}

export class TemplateRegistry {
  private readonly byId: Map<string, TemplateEntry>;

  constructor(entries: TemplateEntry[]) {
    this.byId = new Map();
    for (const e of entries) {
      if (this.byId.has(e.id)) throw new Error(`duplicate template id ${e.id}`);
      this.byId.set(e.id, e);
    }
  }

  static async load(source: TemplateSource = new JsonTemplateSource()): Promise<TemplateRegistry> {
    return new TemplateRegistry(await source.list());
  }

  all(): TemplateEntry[] {
    return [...this.byId.values()];
  }

  get(id: string): TemplateEntry | undefined {
    return this.byId.get(id);
  }

  /** May this template be generated for a CR with this offence? */
  appliesTo(entry: TemplateEntry, offenceCode: string): boolean {
    if (entry.offenceCodes.length === 0) return !OFFENCE_SPECIFIC.includes(entry.family);
    return entry.offenceCodes.includes(offenceCode.toUpperCase());
  }

  /**
   * Templates the documents dialog offers for a CR's offence: never archived ones; current before
   * unconfirmed; templates for this offence before general ones; then by title.
   */
  forOffence(offenceCode: string): TemplateEntry[] {
    const rank = (e: TemplateEntry) => (e.status === 'current' ? 0 : 1) * 2 + (e.offenceCodes.length ? 0 : 1);
    return this.all()
      .filter((e) => e.status !== 'archived' && this.appliesTo(e, offenceCode))
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }
}
