// Documents, files, backup, printing and support channels, through the same dispatch the
// renderer uses. Documents run D's real engine on the frozen templates.
import { copyFile, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultBackupService, type DatabaseFiles } from '@excise/backup';
import {
  DocumentGenerator,
  InMemoryGenerationLog,
  JsonTemplateSource,
  TemplateRegistry,
  type PrintLayout,
} from '@excise/documents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BACKENDS, createDevData, DEV_PASSWORD, type Backend } from './dev-seed.js';
import { createServiceHost, dispatch, type HostOptions } from './host.js';

const DOCS = join(__dirname, '../../../../packages/documents');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'excise-host-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function setup(backend: Backend, extra: Partial<HostOptions> = {}) {
  const { repos, refs, crIds } = await createDevData(backend);
  const registry = await TemplateRegistry.load(
    new JsonTemplateSource(join(DOCS, 'registry', 'templates.json')),
  );
  const log = new InMemoryGenerationLog();
  const generator = new DocumentGenerator({
    registry,
    originalsDir: join(DOCS, 'templates', 'original'),
    outputDir: join(tmp, 'out'),
    log,
  });
  const opened: string[] = [];
  const shown: string[] = [];
  const printed: { layout: PrintLayout; target: string; name: string }[] = [];
  const picture = join(tmp, 'photo.png');
  await writeFile(picture, PNG);
  const { handlers, runScheduledBackup } = createServiceHost(repos, {
    pickSavePath: async () => null,
    pickOpenPath: async () => picture,
    openPath: async (p) => void opened.push(p),
    showItemInFolder: (p) => void shown.push(p),
    filesDir: join(tmp, 'files'),
    documents: { generator, registry, log },
    printOutput: async (layout, target, name) => {
      printed.push({ layout, target, name });
      return target === 'pdf' ? join(tmp, name) : true;
    },
    logFile: join(tmp, 'main.log'),
    ...extra,
  });
  const call = (channel: string, ...args: unknown[]) => dispatch(handlers, channel, args);
  const login = (who: string) => call('auth.login', who, DEV_PASSWORD);
  const lastAudit = async () => (await repos.auditQuery.search({ limit: 1 }))[0];
  return {
    repos,
    refs,
    call,
    login,
    cr: { id: crIds[0] },
    opened,
    shown,
    printed,
    runScheduledBackup,
    lastAudit,
  };
}

describe.each(BACKENDS)('documents channels (%s)', (backend) => {
  it('lists, generates a real .docx, keeps history and opens by file name only', async () => {
    const { call, login, cr, opened, shown, lastAudit } = await setup(backend);
    await login('detecting');
    const list = await call('documents.listFor', cr.id);
    if (!list.ok) throw new Error(list.error.message);
    const data = list.value as { offenceCode: string; groups: { templates: { id: string }[] }[] };
    expect(data.offenceCode).toBe('PUDS');
    const templateId = data.groups[0]!.templates[0]!.id;

    const gen = await call('documents.generate', cr.id, templateId, {});
    if (!gen.ok) throw new Error(gen.error.message);
    const { fileName, filePath } = gen.value as { fileName: string; filePath: string };
    expect((await stat(filePath)).size).toBeGreaterThan(1000);
    expect((await readFile(filePath)).subarray(0, 2).toString()).toBe('PK'); // a zip (.docx)

    const history = await call('documents.history', cr.id);
    expect(history.ok && (history.value as unknown[]).length).toBe(1);
    await call('documents.open', cr.id, fileName);
    await call('documents.showInFolder', cr.id, fileName);
    expect(opened).toEqual([filePath]);
    expect(shown).toEqual([filePath]);
    expect(await lastAudit()).toMatchObject({ action: 'document_generate', rowId: cr.id });

    expect(await call('documents.open', cr.id, '..\\..\\Windows\\win.ini')).toMatchObject({
      error: { name: 'InvalidArguments' },
    });
    expect(await call('documents.open', cr.id, 'not-generated.docx')).toMatchObject({
      error: { name: 'NotAvailableError' },
    });
  });

  it('read-only roles cannot generate', async () => {
    const { call, login, cr } = await setup(backend);
    await login('observation');
    expect(await call('documents.listFor', cr.id)).toMatchObject({
      error: { name: 'PermissionError' },
    });
  });
});

describe.each(BACKENDS)('files channels (%s)', (backend) => {
  it('attach uses the main-process dialog; open uses the stored path', async () => {
    const { call, login, cr, opened } = await setup(backend);
    await login('detecting');
    const r = await call('files.attach', cr.id);
    if (!r.ok) throw new Error(r.error.message);
    const file = r.value as { id: string };
    expect(await call('files.list', cr.id)).toMatchObject({ ok: true, value: [{ id: file.id }] });
    expect(await call('files.preview', file.id)).toMatchObject({ ok: true });
    await call('files.open', file.id);
    expect(opened[0]).toBe(join(tmp, 'files', `${file.id}.png`));
    await call('auth.logout');
    await login('observation');
    expect(await call('files.attach', cr.id)).toMatchObject({ error: { name: 'PermissionError' } });
  });

  it('is cancelled cleanly', async () => {
    const { call, login, cr } = await setup(backend, { pickOpenPath: async () => null });
    await login('oic');
    expect(await call('files.attach', cr.id)).toEqual({ ok: true, value: null });
  });
});

describe.each(BACKENDS)('backup channels (%s)', (backend) => {
  async function withBackup() {
    const live = join(tmp, 'live.db');
    await writeFile(live, 'v1');
    const db: DatabaseFiles = {
      snapshot: (f) => copyFile(live, f),
      check: async () => 'ok',
      replace: (f) => copyFile(f, live),
    };
    const usb = join(tmp, 'usb');
    const backup = new DefaultBackupService({
      db,
      filesDir: join(tmp, 'files'),
      settingsFile: join(tmp, 'backup-settings.json'),
      safetyDir: join(tmp, 'safety'),
      appVersion: 'test',
    });
    let restarted = 0;
    const ctx = await setup(backend, {
      backup,
      pickFolder: async () => usb,
      onRestored: () => void restarted++,
    });
    return { ...ctx, live, usb, restarted: () => restarted };
  }

  it('OIC chooses a folder, backs up, verifies and restores by name', async () => {
    const { call, login, live, usb, restarted } = await withBackup();
    await login('oic');
    expect(await call('backup.chooseFolder')).toMatchObject({ ok: true, value: { folder: usb } });
    const made = await call('backup.now');
    if (!made.ok) throw new Error(made.error.message);
    const { name } = made.value as { name: string };
    expect(await call('backup.list')).toMatchObject({ ok: true, value: [{ name }] });
    expect(await call('backup.verify', name)).toEqual({
      ok: true,
      value: { ok: true, detail: 'ok' },
    });
    await writeFile(live, 'v2');
    expect(await call('backup.restore', name)).toEqual({ ok: true, value: true });
    expect(await readFile(live, 'utf8')).toBe('v1');
    expect(restarted()).toBe(1);
    expect(await call('backup.restore', '../../etc')).toMatchObject({
      error: { name: 'InvalidArguments' },
    });
    expect(await call('backup.updateSettings', { keep: 7, folder: 'C:\\x' })).toMatchObject({
      error: { name: 'InvalidArguments' },
    });
  });

  it('is OIC only, and the timer backs up when due', async () => {
    const { call, login, usb, runScheduledBackup } = await withBackup();
    await login('detecting');
    expect(await call('backup.now')).toMatchObject({ error: { name: 'PermissionError' } });
    expect(await runScheduledBackup()).toBeNull(); // no folder yet
    await call('auth.logout');
    await login('oic');
    await call('backup.chooseFolder');
    expect((await runScheduledBackup())?.kind).toBe('auto');
    expect(await runScheduledBackup()).toBeNull(); // not due again for a day
    expect((await readdir(usb)).length).toBe(1);
  });

  it('without the database layer the channels say so', async () => {
    const { call, login } = await setup(backend);
    await login('oic');
    expect(await call('backup.settings')).toMatchObject({
      error: { name: 'NotAvailableError', code: 'backup' },
    });
  });
});

describe.each(BACKENDS)('print and support channels (%s)', (backend) => {
  it('prints the register and convicts list, and refuses empty certificates', async () => {
    const { call, login, printed, refs, shown } = await setup(backend);
    await login('observation');
    const officeId = refs.office;
    const reg = await call(
      'print.register',
      { scope: { kind: 'year', officeId, year: 2026 }, person: { kind: 'none' }, type: 'register' },
      'pdf',
    );
    expect(reg).toEqual({ ok: true, value: join(tmp, 'report-register-2026.pdf') });
    expect(printed[0]!.layout.html).toContain('Negombo');
    expect(printed[0]!.layout.html).toContain('1/2026');

    expect(await call('print.convictsList', { officeId, year: 2026 }, 'printer')).toEqual({
      ok: true,
      value: true,
    });
    expect(printed[1]!.layout.html).toContain('Sample Accused');
    expect(await call('print.convictsList', { officeId }, 'printer')).toMatchObject({
      error: { code: 'year_required' },
    });
    expect(await call('print.certificateE48', { name: 'nobody-here' }, 'pdf')).toMatchObject({
      error: { code: 'no_rows' },
    });
    await call('support.showLogFile');
    expect(shown).toEqual([join(tmp, 'main.log')]);
  });
});

describe.each(BACKENDS)('import channels (%s)', (backend) => {
  const legacy = {
    tables: {
      Office: {
        columns: [],
        rows: [
          {
            'CR NO 2017': '9/2025',
            office: 'Negombo',
            month: 'May',
            fistsecon: '1',
            'Date of Detection': '2025-05-01T00:00:00',
            Offence: 'PUDS',
            'Name of Accused': 'Imported Person',
          },
        ],
      },
    },
    attachments: [],
  };

  it('dry run first (file from the dialog), then the real run imports that same file', async () => {
    const paths: string[] = [];
    const saved = join(tmp, 'report.csv');
    const { call, login, repos } = await setup(backend, {
      pickOpenPath: async (kind) => (kind === 'accdb' ? join(tmp, 'old.accdb') : null),
      pickSavePath: async () => saved,
      importer: {
        read: async (p) => {
          paths.push(p);
          return legacy;
        },
        reportFile: join(tmp, 'import-report.json'),
      },
    });
    await login('oic');
    expect(await call('import.run')).toMatchObject({ error: { code: 'dry_run_first' } });
    const dry = await call('import.dryRun');
    expect(dry).toMatchObject({ ok: true, value: { mode: 'dry_run', imported: 1 } });
    const imported = () => repos.queries.search({ kind: 'name_nic', name: 'Imported Person' });
    expect(await imported()).toHaveLength(0);
    const real = await call('import.run');
    expect(real).toMatchObject({ ok: true, value: { mode: 'run', imported: 1 } });
    expect(await imported()).toHaveLength(1);
    expect(paths).toEqual([join(tmp, 'old.accdb'), join(tmp, 'old.accdb')]);
    expect(await call('import.saveReport')).toEqual({ ok: true, value: saved });
    expect((await readFile(saved, 'utf8')).slice(1, 8)).toBe('Section');
  });

  it('is OIC only', async () => {
    const { call, login } = await setup(backend, {
      importer: { read: async () => legacy, reportFile: join(tmp, 'r.json') },
    });
    await login('detecting');
    expect(await call('import.dryRun')).toMatchObject({ error: { name: 'PermissionError' } });
  });
});
