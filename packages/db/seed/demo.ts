// A5: demo data for development and the load test. Every name is plainly fake ("Demo …");
// real reference lists come from the Access import or the list editor, never from here.
// Writes with prepared statements in one transaction, so 100,000 CRs take seconds.
import { randomUUID } from 'node:crypto';
import type { ExciseDb } from '../src/connection.js';

export interface DemoRefs {
  office: string;
  offences: { id: string; code: string }[];
  officers: string[];
  informants: string[];
  courts: string[];
}

const OFFENCES = ['PUDS', 'SUDS', 'PUML', 'UST', 'UPT', 'USA', 'UPG', 'UPH', 'UMA', 'UPS'];
const ITEMS: [string, string][] = [
  ['spirit', 'L'],
  ['kasippu', 'L'],
  ['toddy', 'L'],
  ['cannabis', 'g'],
  ['heroin', 'mg'],
  ['cigarettes', 'pcs'],
];
const OUTCOMES = ['fine', 'imprisonment', 'community_service', 'suspended_sentence', 'settlement'];

/** Small deterministic generator, so a seed gives the same data every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function seedDemo(
  db: ExciseDb,
  count: number,
  opts: { year?: number; seed?: number } = {},
): DemoRefs {
  const c = db.sqlite;
  const at = new Date().toISOString();
  const sync = [at, at, null, 1, null] as const;
  const rand = rng(opts.seed ?? 1);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const year = opts.year ?? new Date().getFullYear();

  const ins = (sql: string) => c.prepare(sql);
  const named = (table: string) =>
    ins(
      `INSERT INTO ${table} (id, name, active, created_at, updated_at, updated_by, version, deleted_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
    );
  const officer = ins(
    `INSERT INTO officers (id, kind, name, rank, active, created_at, updated_at, updated_by, version, deleted_at) VALUES (?, ?, ?, NULL, 1, ?, ?, ?, ?, ?)`,
  );
  const offence = ins(
    `INSERT INTO offence_types (id, code, name_si, template_group, active, created_at, updated_at, updated_by, version, deleted_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  );
  const cr = ins(
    `INSERT INTO crime_reports (id, office_id, cr_year, cr_seq, cr_number, month, half_year, offence_type_id, detection_date,
       place, detecting_officer_id, informant_id, quantity, created_at, updated_at, updated_by, version, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const accused = ins(
    `INSERT INTO accused (id, crime_report_id, name, address, nic, created_at, updated_at, updated_by, version, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const seized = ins(
    `INSERT INTO seized_items (id, crime_report_id, position, item_type, quantity, unit, over_quantity, created_at, updated_at, updated_by, version, deleted_at) VALUES (?, ?, 0, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  );
  const kase = ins(
    `INSERT INTO cases (id, crime_report_id, court_id, court_date, case_number, case_type, sithasi, permission_pending, withdrawn, accused_died,
       created_at, updated_at, updated_by, version, deleted_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?)`,
  );
  const outcome = ins(
    `INSERT INTO outcomes (id, case_id, position, outcome_type, convicted_date, fine_amount, prison_months, prison_days, receipt_no, receipt_date,
       add_to_convict_register, created_at, updated_at, updated_by, version, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
  );

  const refs: DemoRefs = {
    office: randomUUID(),
    offences: [],
    officers: [],
    informants: [],
    courts: [],
  };
  const run = c.transaction(() => {
    named('offices').run(refs.office, 'Demo Office', ...sync);
    for (const code of OFFENCES) {
      const id = randomUUID();
      offence.run(id, code, `Demo offence ${code}`, code, ...sync);
      refs.offences.push({ id, code });
    }
    for (let i = 1; i <= 10; i++) {
      const d = randomUUID();
      officer.run(d, 'detecting_officer', `Demo Officer ${i}`, ...sync);
      refs.officers.push(d);
      const inf = randomUUID();
      officer.run(inf, 'informant', `Demo Informant ${i}`, ...sync);
      refs.informants.push(inf);
    }
    for (let i = 1; i <= 3; i++) {
      const id = randomUUID();
      named('courts').run(id, `Demo Court ${i}`, ...sync);
      refs.courts.push(id);
    }

    for (let n = 1; n <= count; n++) {
      const id = randomUUID();
      const crYear = year - Math.floor((n - 1) / Math.max(1, Math.ceil(count / 8))); // spread over 8 years
      const month = 1 + Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * 28);
      const date = `${crYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const off = pick(refs.offences);
      const qty = 100 + Math.floor(rand() * 5000);
      cr.run(
        id,
        refs.office,
        crYear,
        n,
        `${n}/${crYear}`,
        month,
        month <= 6 ? 'first' : 'second',
        off.id,
        date,
        `Demo place ${n % 50}`,
        pick(refs.officers),
        pick(refs.informants),
        qty,
        ...sync,
      );
      const nic = `${String(700000000 + n).padStart(9, '0')}V`;
      accused.run(randomUUID(), id, `Demo Accused ${n}`, `Demo address ${n}`, nic, ...sync);
      const [item, unit] = pick(ITEMS);
      seized.run(randomUUID(), id, item, Math.round(rand() * 1000) / 10, unit, ...sync);
      if (rand() < 0.8) {
        const caseId = randomUUID();
        const courtDate = `${crYear}-${String(Math.min(12, month + 1)).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        kase.run(
          caseId,
          id,
          pick(refs.courts),
          courtDate,
          `B/${n}/${String(crYear).slice(2)}`,
          pick(['trial', 'warrant', 'summons']),
          ...sync,
        );
        if (rand() < 0.7) {
          const type = pick(OUTCOMES);
          outcome.run(
            randomUUID(),
            caseId,
            0,
            type,
            courtDate,
            type === 'fine' ? 100000 * (1 + Math.floor(rand() * 50)) : null,
            type === 'imprisonment' ? 1 + Math.floor(rand() * 12) : null,
            rand() < 0.5 ? 1 : 0,
            ...sync,
          );
        }
      }
    }
  });
  run();
  return refs;
}
