// C7, C8, D10 on the real app: register searches, convicts register and print, previous-offence
// check with the E 48 certificate, reports with export and summary, and the documents dialog.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { label, type LabelKey } from '@excise/labels';
import { expect, test, type Page } from '@playwright/test';
import { openedPaths, SHOTS, startApp, type Running } from './app.js';

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

/** First run, the lists and two CRs (one with a case, a fine and the convicts flag). */
async function seed(page: Page) {
  await page.getByLabel(label('login.username')).fill('station.head');
  await page.getByLabel(label('password.new'), { exact: true }).fill('first-password');
  await page.getByLabel(label('password.confirm')).fill('first-password');
  await button(page, 'setup.submit').click();
  await expect(page.getByRole('heading', { name: label('role.oic') })).toBeVisible();
  return page.evaluate(async () => {
    const ok = <T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
      if (!r.ok) throw new Error(r.error.message);
      return r.value;
    };
    const add = async (kind: string, value: string, code?: string) =>
      ok(
        await window.excise.call('reference.add', kind as never, {
          value,
          ...(code ? { code } : {}),
        }),
      ).id;
    const office = await add('office', 'මීගමුව');
    const offence = await add('offence', 'ස්ප්‍රීතු', 'PUDS');
    const officer = await add('detecting_officer', 'IP Perera');
    const court = await add('court', 'මීගමුව අධිකරණය');
    const base = {
      officeId: office,
      crYear: 2026,
      month: 1,
      halfYear: 'first' as const,
      offenceTypeId: offence,
      detectingOfficerId: officer,
      supportOfficers: [],
      seizedItems: [{ itemType: 'spirit' as const, quantity: 3.5, unit: 'L' }],
      cashNotes: [],
      productions: [],
    };
    const a = ok(
      await window.excise.call('cr.create', {
        ...base,
        crNumber: '1/2026',
        detectionDate: '2026-01-02',
        quantity: 3500,
        accused: { name: 'Kumara Silva', nic: '851234567V', address: 'Negombo' },
      }),
    );
    ok(
      await window.excise.call('cr.create', {
        ...base,
        crNumber: '2/2026',
        detectionDate: '2026-01-05',
        accused: { name: 'Other Person' },
      }),
    );
    ok(
      await window.excise.call(
        'case.save',
        {
          crimeReportId: a.id,
          courtId: court,
          courtDate: '2026-01-10',
          caseNumber: 'B/101/26',
          caseType: 'trial',
          sithasi: false,
          permissionPending: false,
          withdrawn: false,
          accusedDied: false,
          hearings: [],
          outcomes: [
            {
              outcomeType: 'fine',
              fineAmount: 500000,
              convictedDate: '2026-01-20',
              addToConvictRegister: true,
            },
          ],
          rewardVoucherReceived: false,
        },
        null,
      ),
    );
    return { crId: a.id };
  });
}

const savedFiles = () => readdirSync(run.userData).filter((f) => f.startsWith('saved-'));

test('register searches find the CRs and a row opens the CR view', async () => {
  const { page } = run;
  await seed(page);

  await button(page, 'menu.registerByYear').click();
  await field(page, 'cr.office').selectOption({ label: 'මීගමුව' });
  await button(page, 'search.go').click();
  await expect(page.getByRole('cell', { name: '1/2026', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2/2026', exact: true })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'register-by-year.png'), fullPage: true });
  await page.getByRole('cell', { name: '2/2026', exact: true }).click();
  await expect(page.getByRole('heading', { name: new RegExp('2/2026') })).toBeVisible();

  await button(page, 'shell.home').click();
  await button(page, 'menu.byCourtDate').click();
  await field(page, 'cr.office').selectOption({ label: 'මීගමුව' });
  await field(page, 'case.courtDate').fill('2026.01.10');
  await button(page, 'search.go').click();
  await expect(page.getByRole('cell', { name: 'Kumara Silva' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Other Person' })).toHaveCount(0);

  await button(page, 'shell.home').click();
  await button(page, 'menu.byDetectionDate').click();
  await field(page, 'cr.office').selectOption({ label: 'මීගමුව' });
  await field(page, 'cr.detectionDate').fill('2026.01.05');
  await button(page, 'search.go').click();
  await expect(page.getByRole('cell', { name: 'Other Person' })).toBeVisible();
  expect(run.errors).toEqual([]);
});

test('convicts register and previous offences, printed to PDF', async () => {
  const { page } = run;
  await seed(page);

  await button(page, 'menu.convicts').click();
  await field(page, 'cr.office').selectOption({ label: 'මීගමුව' });
  await button(page, 'search.go').click();
  await expect(page.getByRole('cell', { name: 'Kumara Silva' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Other Person' })).toHaveCount(0);
  await button(page, 'search.savePdf').click();
  await expect(page.getByText(label('report.exported'))).toBeVisible();
  const pdf = savedFiles().find((f) => f.endsWith('.pdf'))!;
  expect(statSync(join(run.userData, pdf)).size).toBeGreaterThan(1000);

  await button(page, 'shell.home').click();
  await button(page, 'menu.convictsCheck').click();
  await field(page, 'search.nic').fill('851234567v');
  await button(page, 'search.go').click();
  await expect(page.getByRole('cell', { name: 'Kumara Silva' })).toBeVisible();

  await button(page, 'shell.home').click();
  await button(page, 'menu.previousOffences').click();
  await field(page, 'search.name').fill('kumara');
  await page
    .getByRole('button', { name: label('menu.previousOffences'), exact: true })
    .last()
    .click();
  await expect(page.getByRole('cell', { name: 'B/101/26' })).toBeVisible();
  const before = savedFiles().length;
  await button(page, 'search.savePdf').click();
  await expect.poll(() => savedFiles().length).toBe(before + 1);
  expect(savedFiles().some((f) => f.includes('certificate-E48'))).toBe(true);

  // Nothing found: the certificate is refused with a message, not an empty page.
  await field(page, 'search.name').fill('nobody at all');
  await button(page, 'search.savePdf').click();
  await expect(page.getByText(label('error.no_rows'))).toBeVisible();
  expect(run.errors).toEqual([]);
});

test('reports: monthly register, fines earned, Excel export and the summary by offence', async () => {
  const { page } = run;
  await seed(page);
  await button(page, 'menu.reports').click();
  await field(page, 'cr.office').selectOption({ label: 'මීගමුව' });
  await field(page, 'cr.month').selectOption({ label: label('month.1') });
  await page.getByRole('button', { name: label('report.typeChip.register'), exact: true }).click();
  await expect(page.getByRole('cell', { name: '2/2026', exact: true })).toBeVisible();

  await page
    .getByRole('button', { name: label('report.typeChip.fines_earned'), exact: true })
    .click();
  await expect(page.getByRole('cell', { name: '1/2026', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2/2026', exact: true })).toHaveCount(0);
  await expect(page.getByText(`${label('report.fineTotal')}: 5,000.00`)).toBeVisible();
  await button(page, 'report.exportXlsx').click();
  await expect(page.getByText(label('report.exported'))).toBeVisible();
  const xlsx = savedFiles().find((f) => f.endsWith('.xlsx'))!;
  expect(statSync(join(run.userData, xlsx)).size).toBeGreaterThan(1000);
  await page.screenshot({ path: join(SHOTS, 'reports.png'), fullPage: true });

  await button(page, 'report.summary.offence').click();
  await expect(page.getByRole('cell', { name: 'ස්ප්‍රීතු' })).toBeVisible();
  // 3.5 + 3.5 L spirit, in the offence row and in the totals row.
  await expect(page.getByRole('cell', { name: '7', exact: true })).toHaveCount(2);

  // Case number look-up from the reports menu.
  await button(page, 'reports.byCaseNumber').click();
  await field(page, 'case.court').selectOption({ label: 'මීගමුව අධිකරණය' });
  await field(page, 'case.number').fill('B/101/26');
  await button(page, 'search.go').click();
  await expect(page.getByRole('cell', { name: 'Kumara Silva' })).toBeVisible();
  expect(run.errors).toEqual([]);
});

test('documents dialog makes a real .docx from the CR and opens it', async () => {
  const { page } = run;
  const { crId } = await seed(page);
  await button(page, 'menu.crView').click();
  await field(page, 'cr.office').selectOption({ label: 'මීගමුව' });
  await field(page, 'cr.number').fill('1');
  await button(page, 'cr.find').click();
  await button(page, 'documents.button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(label('documents.family.plaint'))).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'documents-dialog.png') });
  await dialog
    .getByRole('button', { name: new RegExp(`^${label('documents.generate')}:`) })
    .first()
    .click();
  await expect(dialog.getByText(label('documents.made'))).toBeVisible();

  const docs = join(run.userData, 'documents');
  const made = readdirSync(docs).filter((f) => f.endsWith('.docx'));
  expect(made).toHaveLength(1);
  expect(statSync(join(docs, made[0]!)).size).toBeGreaterThan(1000);
  await dialog
    .getByRole('button', { name: label('documents.open'), exact: true })
    .first()
    .click();
  await expect.poll(() => openedPaths(run)).toContainEqual(join(docs, made[0]!));
  await expect(dialog.getByText(made[0]!).last()).toBeVisible(); // history
  expect(existsSync(join(docs, made[0]!))).toBe(true);
  expect(crId).toBeTruthy();
  expect(run.errors).toEqual([]);
});
