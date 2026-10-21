// Phase 8 on the real app: users, reference lists, backup, change history and the Access import.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { label, type LabelKey } from '@excise/labels';
import { expect, test, type Page } from '@playwright/test';
import { answerNextOpen, SHOTS, startApp, type Running } from './app.js';

let run: Running;
test.beforeEach(async () => {
  run = await startApp();
});
test.afterEach(async () => {
  await run.close();
});

const button = (page: Page, key: LabelKey) =>
  page.getByRole('button', { name: label(key), exact: true });
const field = (page: Page, key: LabelKey) => page.getByLabel(label(key), { exact: true });

async function firstRun(page: Page) {
  await page.getByLabel(label('login.username')).fill('station.head');
  await page.getByLabel(label('password.new'), { exact: true }).fill('first-password');
  await page.getByLabel(label('password.confirm')).fill('first-password');
  await button(page, 'setup.submit').click();
  await expect(page.getByRole('heading', { name: label('role.oic') })).toBeVisible();
}

test('users: add, reset password, deactivate; own account cannot be deactivated', async () => {
  const { page } = run;
  await firstRun(page);
  await button(page, 'menu.adminHub').click();
  await button(page, 'admin.users').click();
  const form = page.getByRole('form', { name: label('users.add') });
  await form.getByLabel(label('login.username'), { exact: true }).fill('det1');
  await form.getByLabel(label('users.role')).selectOption({ label: label('role.detecting') });
  await form.getByLabel(label('users.tempPassword')).fill('temporary1');
  await form.getByRole('button', { name: label('users.add'), exact: true }).click();
  const row = page.getByRole('row', { name: /det1/ });
  await expect(row).toContainText(label('users.mustChange'));
  // The station head's own row has no deactivate button.
  await expect(
    page
      .getByRole('row', { name: /station\.head/ })
      .getByRole('button', { name: label('users.deactivate') }),
  ).toHaveCount(0);

  await row.getByRole('button', { name: label('users.reset'), exact: true }).click();
  await page.getByRole('dialog').getByLabel(label('users.tempPassword')).fill('temporary2');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: label('users.reset'), exact: true })
    .click();
  await expect(page.getByText(label('users.resetDone'))).toBeVisible();

  await row.getByRole('button', { name: label('users.deactivate'), exact: true }).click();
  await expect(row).toContainText(label('users.deactivate')); // the badge
  await expect(
    row.getByRole('button', { name: label('users.activate'), exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'users.png'), fullPage: true });
  expect(run.errors).toEqual([]);
});

test('reference lists: add, rename, deactivate, delete; a used item cannot be deleted', async () => {
  const { page } = run;
  await firstRun(page);
  await button(page, 'menu.referenceLists').click();
  // Office tab is first.
  const addOffice = page.getByRole('form', { name: new RegExp(label('lists.add')) });
  await addOffice.getByLabel(label('lists.value'), { exact: true }).fill('මීගමුව');
  await addOffice.getByRole('button', { name: label('lists.add'), exact: true }).click();
  await expect(page.getByRole('cell', { name: 'මීගමුව' })).toBeVisible();

  // Offence tab: code required.
  await page.getByRole('tab', { name: label('list.offence') }).click();
  const addOffence = page.getByRole('form', { name: new RegExp(label('lists.add')) });
  await addOffence.getByLabel(label('lists.code'), { exact: true }).fill('puds');
  await addOffence.getByLabel(label('lists.value'), { exact: true }).fill('ස්ප්‍රීතු');
  await addOffence.getByRole('button', { name: label('lists.add'), exact: true }).click();
  await expect(page.getByRole('cell', { name: 'PUDS', exact: true })).toBeVisible();
  await addOffence.getByLabel(label('lists.code'), { exact: true }).fill('UPG');
  await addOffence.getByLabel(label('lists.value'), { exact: true }).fill('ගංජා');
  await addOffence.getByRole('button', { name: label('lists.add'), exact: true }).click();

  // Rename keeps the item.
  const upg = page.getByRole('row', { name: /UPG/ });
  await upg.getByRole('button', { name: label('lists.rename'), exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel(label('lists.value'), { exact: true })
    .fill('ගංජා ළඟ තබා ගැනීම');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: label('common.save'), exact: true })
    .click();
  await expect(page.getByRole('cell', { name: /ගංජා ළඟ තබා ගැනීම/ })).toBeVisible();

  // A CR uses PUDS: deleting it is refused; deleting the unused UPG works.
  await page.evaluate(async () => {
    const offices = await window.excise.call('reference.list', 'office');
    const offences = await window.excise.call('reference.list', 'offence');
    if (!offices.ok || !offences.ok) throw new Error('lists');
    const r = await window.excise.call('cr.create', {
      officeId: offices.value[0]!.id,
      crYear: 2026,
      crNumber: '1/2026',
      month: 1,
      halfYear: 'first',
      offenceTypeId: offences.value.find((o) => o.code === 'PUDS')!.id,
      detectionDate: '2026-01-02',
      accused: { name: 'Person' },
      supportOfficers: [],
      seizedItems: [],
      cashNotes: [],
      productions: [],
    });
    if (!r.ok) throw new Error(r.error.message);
  });
  const puds = page.getByRole('row', { name: /PUDS/ });
  await puds.getByRole('button', { name: label('lists.delete'), exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: label('lists.delete'), exact: true })
    .click();
  await expect(page.getByText(label('error.in_use'))).toBeVisible();
  await puds.getByRole('button', { name: label('users.deactivate'), exact: true }).click();
  await expect(puds).toContainText(label('lists.inactive'));

  await page
    .getByRole('row', { name: /UPG/ })
    .getByRole('button', { name: label('lists.delete'), exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: label('lists.delete'), exact: true })
    .click();
  await expect(page.getByRole('row', { name: /UPG/ })).toHaveCount(0);
  await page.screenshot({ path: join(SHOTS, 'reference-lists.png'), fullPage: true });
  expect(run.errors).toEqual([]);
});

test('backup: choose folder, back up now, check it; change history shows what happened', async () => {
  const { page } = run;
  await firstRun(page);
  const usb = join(run.userData, 'usb');
  mkdirSync(usb);
  await button(page, 'menu.adminHub').click();
  await button(page, 'admin.backup').click();
  await expect(page.getByText(label('backup.noFolder'))).toBeVisible();
  await answerNextOpen(run, usb);
  await button(page, 'backup.chooseFolder').click();
  await expect(page.getByText(usb)).toBeVisible();
  await button(page, 'backup.now').click();
  await expect(page.getByText(label('backup.done'))).toBeVisible();
  await expect(page.getByRole('cell', { name: label('backup.kind.manual') })).toBeVisible();
  await button(page, 'backup.verify').click();
  await expect(page.getByText(label('backup.ok'))).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'backup.png'), fullPage: true });

  await button(page, 'shell.home').click();
  await button(page, 'menu.adminHub').click();
  await button(page, 'admin.audit').click();
  await expect(page.getByRole('cell', { name: 'backup', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'user_create', exact: true })).toBeVisible();
  await field(page, 'audit.table').selectOption({ label: label('audit.table.users') });
  await button(page, 'search.go').click();
  await expect(page.getByRole('cell', { name: 'backup', exact: true })).toHaveCount(0);
  await page.getByRole('cell', { name: 'user_create', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'station.head' }).last()).toBeVisible();
  expect(run.errors).toEqual([]);
});

test('import from Access: dry run, then import the checked file', async () => {
  test.skip(process.platform !== 'win32', 'The Access reader needs Windows and the Access engine');
  const { page } = run;
  const fixture = join(import.meta.dirname, '../migration/fixtures/make-accdb.ps1');
  const spec = join(run.userData, 'spec.json');
  const accdb = join(run.userData, 'legacy.accdb');
  writeFileSync(
    spec,
    JSON.stringify({
      tables: [
        {
          name: 'Office',
          fields: [
            { name: 'CR NO 2017', type: 'text' },
            { name: 'office', type: 'text' },
            { name: 'month', type: 'text' },
            { name: 'fistsecon', type: 'text' },
            { name: 'Date of Detection', type: 'date' },
            { name: 'Offence', type: 'text' },
            { name: 'Name of Accused', type: 'text' },
            { name: 'Odd column', type: 'text' },
          ],
          rows: [
            {
              'CR NO 2017': '5/2025',
              office: 'Negombo',
              month: 'March',
              fistsecon: '1',
              'Date of Detection': '2025-03-02',
              Offence: 'PUDS',
              'Name of Accused': 'Imported Person',
            },
            {
              'CR NO 2017': '6/2025',
              office: 'Negombo',
              month: '13',
              fistsecon: '1',
              'Date of Detection': '2025-03-05',
              Offence: 'UPG',
              'Name of Accused': 'Bad Month',
            },
          ],
        },
      ],
    }),
    'utf8',
  );
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        fixture,
        spec,
        accdb,
      ],
      {
        windowsHide: true,
      },
    );
  } catch (e) {
    test.skip((e as { status?: number }).status === 3, 'No Access Database Engine on this PC');
    throw e;
  }

  await firstRun(page);
  await button(page, 'menu.adminHub').click();
  await button(page, 'admin.import').click();
  await answerNextOpen(run, accdb);
  await button(page, 'import.dryRun').click();
  await expect(page.getByText(label('import.wouldImport'))).toBeVisible();
  await expect(page.getByText('Odd column')).toBeVisible(); // unmapped column reported
  await expect(page.getByRole('cell', { name: '6/2025' })).toBeVisible(); // the bad month
  await page.screenshot({ path: join(SHOTS, 'import.png'), fullPage: true });

  await button(page, 'import.run').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: label('import.run'), exact: true })
    .click();
  await expect(page.getByText(label('import.imported'), { exact: true })).toBeVisible();
  const found = await page.evaluate(() =>
    window.excise.call('search.crimeReports', { kind: 'name_nic', name: 'Imported Person' }),
  );
  expect(found).toMatchObject({ ok: true, value: [{ crNumber: '5/2025' }] });
  expect(run.errors).toEqual([]);
});
