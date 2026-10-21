// C4–C6 on the real app: enter a CR through every tab, save, validation messages, the
// unsaved-changes prompt, case progress with outcomes, the read-only view, delete and restore.
import { join } from 'node:path';
import { label } from '@excise/labels';
import { expect, test, type Page } from '@playwright/test';
import { SHOTS, startApp, type Running } from './app.js';

let run: Running;
test.beforeEach(async () => {
  run = await startApp();
});
test.afterEach(async () => {
  await run.close();
});

const button = (page: Page, key: Parameters<typeof label>[0]) =>
  page.getByRole('button', { name: label(key), exact: true });
const field = (page: Page, key: Parameters<typeof label>[0]) =>
  page.getByLabel(label(key), { exact: true });

async function setUp(page: Page) {
  await page.getByLabel(label('login.username')).fill('station.head');
  await page.getByLabel(label('password.new'), { exact: true }).fill('first-password');
  await page.getByLabel(label('password.confirm')).fill('first-password');
  await button(page, 'setup.submit').click();
  await expect(page.getByRole('heading', { name: label('role.oic') })).toBeVisible();
  // Lists through the same IPC the list editor will use.
  return page.evaluate(async () => {
    const add = async (kind: string, value: string, code?: string) => {
      const r = await window.excise.call('reference.add', kind as never, {
        value,
        ...(code ? { code } : {}),
      });
      if (!r.ok) throw new Error(r.error.message);
      return r.value.id;
    };
    return {
      office: await add('office', 'මීගමුව'),
      offence: await add('offence', 'ස්ප්‍රීතු ළඟ තබා ගැනීම', 'PUDS'),
      officer: await add('detecting_officer', 'IP Perera'),
      support: await add('support_officer', 'PC Fernando'),
      court: await add('court', 'මීගමුව මහේස්ත්‍රාත් අධිකරණය'),
    };
  });
}

test('enter a CR through every tab, then record the case and see it everywhere', async () => {
  const { page } = run;
  page.on('dialog', (d) => void (d.message() === label('cr.unsaved') ? d.dismiss() : d.accept()));
  await setUp(page);

  await button(page, 'menu.crEntry').click();
  await expect(page.getByRole('heading', { name: label('menu.crEntry') })).toBeVisible();
  // Header strip
  await field(page, 'cr.office').last().selectOption({ label: 'මීගමුව' });
  await field(page, 'cr.year').last().fill('2026');
  await field(page, 'cr.number').last().fill('7');
  await field(page, 'cr.month')
    .last()
    .selectOption({ label: label('month.1') });
  // Detection
  await field(page, 'cr.detectionDate').fill('2026.01.02');
  await field(page, 'cr.place').fill('කොච්චිකඩේ');
  await field(page, 'cr.offence').selectOption({ label: 'PUDS – ස්ප්‍රීතු ළඟ තබා ගැනීම' });
  await field(page, 'cr.detectingOfficer').selectOption({ label: 'IP Perera' });
  await page
    .getByLabel(`${label('cr.supportOfficer')} 3`, { exact: true })
    .selectOption({ label: 'PC Fernando' });

  // Saving without the accused name: the service says so on the Accused tab.
  await button(page, 'common.save').click();
  await expect(page.getByRole('tab', { name: `${label('tab.accused')} ⚠` })).toBeVisible();

  // Accused
  await page.getByRole('tab', { name: new RegExp(label('tab.accused')) }).click();
  await field(page, 'accused.name').fill('ඒ. බී. කුමාර');
  await field(page, 'accused.nic').fill('851234567v');
  await page.getByLabel(label('accused.sex.male')).check();
  // Times
  await page.getByRole('tab', { name: label('tab.times') }).click();
  await field(page, 'times.detection').fill('14.45');
  // Cash
  await page.getByRole('tab', { name: label('tab.cash') }).click();
  await page.getByLabel('Rs 1000', { exact: true }).first().fill('S/426 672487');
  await field(page, 'cash.foundPlace').fill('shirt pocket');
  // Seized
  await page.getByRole('tab', { name: label('tab.seized') }).click();
  await field(page, 'seized.spirit').fill('3.5');
  await field(page, 'cr.quantity').fill('3500');
  // Court
  await page.getByRole('tab', { name: label('tab.court') }).click();
  await field(page, 'case.court').selectOption({ label: 'මීගමුව මහේස්ත්‍රාත් අධිකරණය' });
  await field(page, 'case.courtDate').fill('2026.01.10');
  await page.screenshot({ path: join(SHOTS, 'cr-entry.png'), fullPage: true });

  await button(page, 'common.save').click();
  await expect(page.getByText(label('cr.saved'))).toBeVisible();
  await expect(page.getByRole('group', { name: '7/2026' })).toBeVisible();

  // What the database holds.
  const stored = await page.evaluate(async () => {
    const found = await window.excise.call('search.crimeReports', {
      kind: 'name_nic',
      nic: '851234567V',
    });
    if (!found.ok || !found.value[0]) throw new Error('not found');
    const id = found.value[0].id;
    const [cr, kase] = await Promise.all([
      window.excise.call('cr.get', id),
      window.excise.call('case.getByCrimeReport', id),
    ]);
    return { cr: cr.ok ? cr.value : null, kase: kase.ok ? kase.value : null };
  });
  expect(stored.cr).toMatchObject({
    crNumber: '7/2026',
    month: 1,
    detectionDate: '2026-01-02',
    accused: { name: 'ඒ. බී. කුමාර', nic: '851234567V', sex: 'male' },
    times: { detection: '14.45' },
    cashNotes: [{ kind: 'used', denomination: 1000, text: 'S/426 672487' }],
    seizedItems: [{ itemType: 'spirit', quantity: 3.5, unit: 'L' }],
    supportOfficers: [{ position: 3 }],
    quantity: 3500,
  });
  expect(stored.kase).toMatchObject({ courtDate: '2026-01-10', version: 1 });

  // Unsaved changes: leaving asks; dismissing keeps the screen.
  await page.getByRole('tab', { name: label('tab.detection') }).click();
  await field(page, 'cr.place').fill('Changed place');
  await button(page, 'login.back').click();
  await expect(page.getByRole('heading', { name: label('menu.crEntry') })).toBeVisible();
  await button(page, 'cr.undo').click();
  await expect(field(page, 'cr.place')).toHaveValue('කොච්චිකඩේ');

  // Case progress from the menu, choosing the CR by office + number.
  await button(page, 'login.back').click();
  await button(page, 'menu.caseProgress').click();
  await field(page, 'cr.office').selectOption({ label: 'මීගමුව' });
  await field(page, 'cr.number').fill('7');
  await button(page, 'cr.find').click();
  await field(page, 'case.number').fill('B/101/26');
  await page.getByLabel(label('caseType.trial')).check();
  await button(page, 'case.addHearing').click();
  await page.getByLabel(`${label('case.hearingDate')} 1`, { exact: true }).fill('2026.02.01');
  await page.getByLabel(label('outcome.fine'), { exact: true }).check();
  await page.getByLabel(label('outcome.imprisonment'), { exact: true }).check();
  await field(page, 'case.fineAmount').fill('5000');
  await field(page, 'case.convictedDate').fill('2026.02.01');
  await page
    .getByLabel(`${label('outcome.imprisonment')} – ${label('case.prisonMonths')}`)
    .fill('6');
  await page.getByLabel(label('case.addToConvicts')).check();
  await page.getByLabel(label('case.note.other')).fill('Handed to the court clerk');
  await page.screenshot({ path: join(SHOTS, 'case-progress.png'), fullPage: true });
  await button(page, 'common.save').click();
  await expect(page.getByText(label('cr.saved')).last()).toBeVisible();

  const noted = await page.evaluate(async () => {
    const list = await window.excise.call('search.crimeReports', {
      kind: 'name_nic',
      name: 'කුමාර',
    });
    if (!list.ok || !list.value[0]) return null;
    const cr = await window.excise.call('cr.get', list.value[0].id);
    return cr.ok ? cr.value?.notes : null;
  });
  expect(noted).toBe('Handed to the court clerk');

  const convicts = await page.evaluate(() => window.excise.call('search.convicts', { year: 2026 }));
  expect(convicts).toMatchObject({
    ok: true,
    value: [
      {
        crNumber: '7/2026',
        fineAmount: 500000,
        prisonMonths: 6,
        outcomes: ['fine', 'imprisonment'],
      },
    ],
  });

  // Read-only view.
  await button(page, 'login.back').click();
  await button(page, 'menu.crView').click();
  await field(page, 'cr.office').selectOption({ label: 'මීගමුව' });
  await field(page, 'cr.number').fill('7');
  await button(page, 'cr.find').click();
  await expect(page.getByText('ඒ. බී. කුමාර')).toBeVisible();
  await expect(page.getByText('B/101/26')).toBeVisible();
  await expect(page.getByText('5,000.00')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'cr-view.png'), fullPage: true });

  // Delete and restore from the entry screen.
  await button(page, 'cr.edit').click();
  await button(page, 'cr.delete').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: label('common.yes'), exact: true })
    .click();
  await expect(page.getByText(label('cr.deleted'))).toBeVisible();
  await button(page, 'cr.restore').click();
  await expect(page.getByText(label('cr.deleted'))).toHaveCount(0);
  expect(run.errors).toEqual([]);
});

test('another user saving first gives the "changed by someone else" message', async () => {
  const { page } = run;
  const refs = await setUp(page);
  const id = await page.evaluate(async (r) => {
    const made = await window.excise.call('cr.create', {
      officeId: r.office,
      crYear: 2026,
      crNumber: '9/2026',
      month: 2,
      halfYear: 'first',
      offenceTypeId: r.offence,
      detectionDate: '2026-02-01',
      accused: { name: 'Person' },
      supportOfficers: [],
      seizedItems: [],
      cashNotes: [],
      productions: [],
    });
    if (!made.ok) throw new Error(made.error.message);
    return made.value.id;
  }, refs);
  await button(page, 'menu.crEntry').click();
  await field(page, 'cr.office').last().selectOption({ label: 'මීගමුව' });
  await field(page, 'cr.number').first().fill('9');
  await button(page, 'cr.find').click();
  // Wait for the CR to be open: typing earlier lands in the new-CR form that it replaces.
  await expect(page.getByRole('group', { name: '9/2026' })).toBeVisible();
  await field(page, 'cr.place').fill('Mine');
  await expect(button(page, 'common.save')).toBeEnabled();
  // Someone else saves the same CR meanwhile.
  await page.evaluate(async (crId) => {
    const cur = await window.excise.call('cr.get', crId);
    if (!cur.ok || !cur.value) throw new Error('missing');
    const { id: _i, version, createdAt: _c, updatedAt: _u, deleted: _d, ...body } = cur.value;
    void [_i, _c, _u, _d];
    await window.excise.call('cr.update', crId, version, { ...body, place: 'Theirs' });
  }, id);
  await button(page, 'common.save').click();
  await expect(page.getByRole('alert').first()).toContainText(label('error.conflict'));
});
