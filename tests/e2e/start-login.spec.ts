// C3 flows on the real app: first-run set-up, menus per role, log out, role-matched login,
// forced password change for a new user, and the strict CSP (no errors in the page).
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

async function firstRun(page: Page) {
  await expect(page.getByRole('heading', { name: label('admin.firstRun') })).toBeVisible();
  await page.getByLabel(label('login.username')).fill('station.head');
  await page.getByLabel(label('password.new'), { exact: true }).fill('first-password');
  await page.getByLabel(label('password.confirm')).fill('first-password');
  await page.getByRole('button', { name: label('setup.submit'), exact: true }).click();
  await expect(page.getByRole('heading', { name: label('role.oic') })).toBeVisible();
}

test('first run: the station head creates the first account and sees the full menu', async () => {
  const { page } = run;
  await page.screenshot({ path: join(SHOTS, 'first-run.png') });
  await firstRun(page);
  for (const key of [
    'menu.crEntry',
    'menu.reports',
    'menu.referenceLists',
    'admin.users',
    'admin.backup',
  ] as const) {
    await expect(page.getByRole('button', { name: label(key), exact: true })).toBeVisible();
  }
  await page.screenshot({ path: join(SHOTS, 'home-oic.png'), fullPage: true });

  await page.getByRole('button', { name: label('menu.convicts'), exact: true }).click();
  await expect(
    page.getByRole('heading', { name: label('menu.convicts'), exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: label('login.back'), exact: true }).click();

  await page.getByRole('button', { name: label('shell.logout'), exact: true }).click();
  await expect(page.getByRole('navigation', { name: label('start.chooseRole') })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'start.png') });

  // Number keys pick a role, but not while typing in a field.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: label('role.observation') })).toBeVisible();
  await page.getByLabel(label('login.username')).fill('');
  await page.keyboard.press('2');
  await expect(page.getByLabel(label('login.username'))).toHaveValue('2');
  await expect(page.getByRole('heading', { name: label('role.observation') })).toBeVisible();
  expect(run.errors).toEqual([]);
});

test('login must match the role button; new users must change their password; observers see no CR entry', async () => {
  const { page } = run;
  await firstRun(page);
  // The users screen comes later; create an observation officer through the same IPC bridge.
  const created = await page.evaluate(() =>
    window.excise.call('auth.createUser', 'obs1', 'temporary1', 'observation'),
  );
  expect(created).toMatchObject({ ok: true });
  await page.getByRole('button', { name: label('shell.logout'), exact: true }).click();

  // Wrong role button: refused.
  await page.getByRole('button', { name: label('role.detecting'), exact: true }).click();
  await page.getByLabel(label('login.username')).fill('obs1');
  await page.getByLabel(label('login.password')).fill('temporary1');
  await page.getByRole('button', { name: label('login.submit'), exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(label('role.observation'));

  // Wrong password: the general message. Another role card switches the form in place.
  await page.getByRole('button', { name: label('role.observation'), exact: true }).click();
  await expect(page.getByRole('heading', { name: label('role.observation') })).toBeVisible();
  await page.getByLabel(label('login.username')).fill('obs1');
  await page.getByLabel(label('login.password')).fill('wrong-one');
  await page.getByRole('button', { name: label('login.submit'), exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(label('error.invalid_credentials'));

  // Right role and password: the password change comes first.
  await page.getByLabel(label('login.password')).fill('temporary1');
  await page.getByRole('button', { name: label('login.submit'), exact: true }).click();
  await expect(page.getByText(label('password.mustChange'))).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'change-password.png') });
  await page.getByLabel(label('password.old')).fill('temporary1');
  await page.getByLabel(label('password.new'), { exact: true }).fill('my-own-pass');
  await page.getByLabel(label('password.confirm')).fill('my-own-pass');
  await page.getByRole('button', { name: label('common.save'), exact: true }).click();

  await expect(page.getByRole('heading', { name: label('role.observation') })).toBeVisible();
  await expect(
    page.getByRole('button', { name: label('menu.reports'), exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: label('menu.crEntry'), exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: label('admin.users'), exact: true })).toHaveCount(
    0,
  );
  // The service refuses too, not only the menu.
  const write = await page.evaluate(() =>
    window.excise.call('reference.add', 'court', { value: 'X' }),
  );
  expect(write).toMatchObject({ ok: false, error: { name: 'PermissionError' } });
  expect(run.errors).toEqual([]);
});
