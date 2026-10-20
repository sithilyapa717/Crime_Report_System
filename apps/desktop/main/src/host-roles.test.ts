// Security check (REMAINING_WORK Phase 7, "every IPC channel has a permission test per role"):
// every channel is called as each of the four roles, and the PermissionError refusals must match
// the role matrix of REWRITE_PLAN §1.2 / §5 exactly. A new channel without an entry here fails.
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultBackupService } from '@excise/backup';
import {
  DocumentGenerator,
  InMemoryGenerationLog,
  JsonTemplateSource,
  TemplateRegistry,
} from '@excise/documents';
import type { Role } from '@excise/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARG_SCHEMAS } from './args.js';
import { createDevData, DEV_PASSWORD } from './dev-seed.js';
import { createServiceHost, dispatch, type Channel } from './host.js';

const DOCS = join(__dirname, '../../../../packages/documents');
const ROLES: Role[] = ['oic', 'detecting', 'observation', 'supervising'];
const WRITERS: Role[] = ['oic', 'detecting'];
const OIC: Role[] = ['oic'];
const BY_OFFICER: Role[] = ['oic', 'detecting', 'supervising'];
const NOBODY: Role[] = [];
const EVERYONE = ROLES;

/** Who may call each channel. Every channel must be listed. */
const ALLOWED: Record<Channel, Role[]> = {
  'auth.login': EVERYONE,
  'auth.logout': EVERYONE,
  'auth.currentSession': EVERYONE,
  'auth.changePassword': EVERYONE,
  'auth.needsFirstUser': EVERYONE,
  'auth.createFirstUser': EVERYONE, // refused for everyone once set up, but not by role
  'auth.createUser': OIC,
  'auth.unlockUser': OIC,
  'users.list': OIC,
  'users.setActive': OIC,
  'users.resetPassword': OIC,
  'reference.list': EVERYONE,
  'reference.add': OIC,
  'reference.rename': OIC,
  'reference.setActive': OIC,
  'reference.remove': OIC,
  'reference.usageCount': OIC,
  'audit.search': OIC,
  'cr.create': WRITERS,
  'cr.update': WRITERS,
  'cr.get': EVERYONE,
  'cr.find': EVERYONE,
  'cr.softDelete': WRITERS,
  'cr.restore': WRITERS,
  'case.save': WRITERS,
  'case.getByCrimeReport': EVERYONE,
  'search.crimeReports': EVERYONE,
  'search.convicts': EVERYONE,
  'search.previousOffences': EVERYONE,
  'reports.run': EVERYONE,
  'reports.summary': EVERYONE,
  'reports.export': EVERYONE,
  'docdata.buildFor': WRITERS,
  'files.attach': WRITERS,
  'files.list': EVERYONE,
  'files.preview': EVERYONE,
  'files.remove': WRITERS,
  'files.open': EVERYONE,
  'documents.listFor': WRITERS,
  'documents.generate': WRITERS,
  'documents.history': EVERYONE,
  'documents.open': EVERYONE,
  'documents.showInFolder': EVERYONE,
  'print.certificateE48': EVERYONE,
  'print.convictsList': EVERYONE,
  'print.register': EVERYONE,
  'backup.settings': OIC,
  'backup.updateSettings': OIC,
  'backup.chooseFolder': OIC,
  'backup.now': OIC,
  'backup.list': OIC,
  'backup.verify': OIC,
  'backup.restore': OIC,
  'backup.restoreFromFolder': OIC,
  'import.dryRun': OIC,
  'import.run': OIC,
  'import.lastReport': OIC,
  'import.saveReport': OIC,
  'support.fontCheck': OIC,
  'support.showLogFile': EVERYONE,
};

/** Per-officer reports are a separate permission (observation officers may not). */
const PER_OFFICER_REPORT_ALLOWED = BY_OFFICER;

let tmp: string;
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'excise-roles-'));
});
afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function host() {
  const data = await createDevData('memory');
  const registry = await TemplateRegistry.load(
    new JsonTemplateSource(join(DOCS, 'registry', 'templates.json')),
  );
  const log = new InMemoryGenerationLog();
  const live = join(tmp, `live-${Math.random()}.db`);
  await writeFile(live, 'x');
  const picture = join(tmp, 'p.png');
  await writeFile(picture, 'png');
  const { handlers } = createServiceHost(data.repos, {
    pickSavePath: async () => null,
    pickOpenPath: async () => null,
    pickFolder: async () => null,
    openPath: async () => undefined,
    showItemInFolder: () => undefined,
    filesDir: join(tmp, 'files'),
    documents: {
      registry,
      log,
      generator: new DocumentGenerator({
        registry,
        log,
        originalsDir: join(DOCS, 'templates', 'original'),
        outputDir: join(tmp, 'out'),
      }),
    },
    backup: new DefaultBackupService({
      db: {
        snapshot: (f) => copyFile(live, f),
        check: async () => 'ok',
        replace: async () => undefined,
      },
      filesDir: join(tmp, 'files'),
      settingsFile: join(tmp, `settings-${Math.random()}.json`),
      safetyDir: join(tmp, 'safety'),
      appVersion: 't',
    }),
    printOutput: async () => null,
    importer: {
      read: async () => ({ tables: {}, attachments: [] }),
      reportFile: join(tmp, 'r.json'),
    },
    onRestored: () => undefined,
    logFile: join(tmp, 'main.log'),
  });
  return { handlers, ...data };
}

describe('every IPC channel refuses the roles it should, and only those', () => {
  it('has an entry for every channel', () => {
    expect(Object.keys(ALLOWED).sort()).toEqual(Object.keys(ARG_SCHEMAS).sort());
  });

  for (const role of ROLES) {
    it(`as ${role}`, async () => {
      const { handlers, refs, crIds } = await host();
      const [cr] = crIds;
      const scope = { kind: 'year' as const, officeId: refs.office, year: 2026 };
      const params = { scope, person: { kind: 'none' as const }, type: 'register' as const };
      const crBody = {
        officeId: refs.office,
        crYear: 2026,
        crNumber: '50/2026',
        month: 1,
        halfYear: 'first',
        offenceTypeId: refs.offencePuds,
        detectionDate: '2026-01-02',
        accused: { name: 'X' },
        supportOfficers: [],
        seizedItems: [],
        cashNotes: [],
        productions: [],
      };
      const uuid = '00000000-0000-4000-8000-000000000001';
      const ARGS: Record<Channel, unknown[]> = {
        'auth.login': ['nobody', 'x'],
        'auth.logout': [],
        'auth.currentSession': [],
        'auth.changePassword': ['wrong', 'whatever1'],
        'auth.needsFirstUser': [],
        'auth.createFirstUser': ['someone', 'longenough'],
        'auth.createUser': [`new.${role}`, 'longenough', 'detecting'],
        'auth.unlockUser': [uuid],
        'users.list': [],
        'users.setActive': [uuid, true],
        'users.resetPassword': [uuid, 'longenough'],
        'reference.list': ['court'],
        'reference.add': ['court', { value: `Court ${role}` }],
        'reference.rename': [refs.otherCourt, { value: `Renamed ${role}` }],
        'reference.setActive': [refs.otherCourt, true],
        'reference.remove': [uuid],
        'reference.usageCount': [refs.court],
        'audit.search': [{}],
        'cr.create': [crBody],
        'cr.update': [cr, 99, crBody],
        'cr.get': [cr],
        'cr.find': [refs.office, 2026, '1/2026'],
        'cr.softDelete': [uuid],
        'cr.restore': [uuid],
        'case.save': [{ crimeReportId: uuid, courtId: refs.court }, null],
        'case.getByCrimeReport': [cr],
        'search.crimeReports': [{ kind: 'year', officeId: refs.office, year: 2026 }],
        'search.convicts': [{ year: 2026 }],
        'search.previousOffences': [{ name: 'Sample' }],
        'reports.run': [params],
        'reports.summary': [params, 'offence'],
        'reports.export': [params, 'csv'],
        'docdata.buildFor': [cr],
        'files.attach': [cr],
        'files.list': [cr],
        'files.preview': [uuid],
        'files.remove': [uuid],
        'files.open': [uuid],
        'documents.listFor': [cr],
        'documents.generate': [cr, 'no-such-template', {}],
        'documents.history': [cr],
        'documents.open': [cr, 'none.docx'],
        'documents.showInFolder': [cr, 'none.docx'],
        'print.certificateE48': [{ name: 'Sample' }, 'pdf'],
        'print.convictsList': [{ year: 2026 }, 'pdf'],
        'print.register': [params, 'pdf'],
        'backup.settings': [],
        'backup.updateSettings': [{ keep: 3 }],
        'backup.chooseFolder': [],
        'backup.now': [],
        'backup.list': [],
        'backup.verify': ['excise-backup-none'],
        'backup.restore': ['excise-backup-none'],
        'backup.restoreFromFolder': [],
        'import.dryRun': [],
        'import.run': [],
        'import.lastReport': [],
        'import.saveReport': [],
        'support.fontCheck': [],
        'support.showLogFile': [],
      };

      const login = await dispatch(handlers, 'auth.login', [role, DEV_PASSWORD]);
      expect(login.ok).toBe(true);
      const refused: string[] = [];
      for (const channel of Object.keys(ARGS) as Channel[]) {
        if (channel === 'auth.logout' || channel === 'auth.login') continue; // keep the session
        const r = await dispatch(handlers, channel, ARGS[channel]);
        if (!r.ok && r.error.name === 'InvalidArguments')
          throw new Error(`bad test args for ${channel}`);
        if (!r.ok && r.error.name === 'PermissionError') refused.push(channel);
      }
      const expected = (Object.keys(ALLOWED) as Channel[]).filter(
        (c) => !ALLOWED[c].includes(role) && c !== 'auth.login' && c !== 'auth.logout',
      );
      expect(refused.sort()).toEqual(expected.sort());

      // Per-officer reports: a permission of its own.
      const byOfficer = await dispatch(handlers, 'reports.run', [
        { ...params, person: { kind: 'detecting_officer', officerId: refs.detectingOfficer } },
      ]);
      expect(byOfficer.ok || byOfficer.error.name !== 'PermissionError').toBe(
        PER_OFFICER_REPORT_ALLOWED.includes(role),
      );
      void NOBODY;
    });
  }
});
