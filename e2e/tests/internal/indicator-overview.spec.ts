import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { completeDraft } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { MORTALITY_ID, MORTALITY_NAME } from '../support/indicator-page.ts';
import { ADMIN, PUBLISHER, TEAM_B_PUBLISHER } from '../support/sign-in.ts';

const PUBLISHED_OVERVIEW_PATH = `/dashboard/indicators/${MORTALITY_ID}`;

test.use({ storageState: PUBLISHER.storageState });

test('shows the indicator a publisher picked from the dashboard', async ({ page }) => {
  const name = uniqueIndicatorName('overview');
  const id = await createDraft(page, name);

  await page.goto('/dashboard');
  await page.getByRole('table').getByRole('link', { name, exact: true }).click();

  await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText(/^ID: \d+$/)).toBeVisible();
});

test('shows the scheduled publication date under the status tags', async ({ page }) => {
  const id = await createDraft(page, uniqueIndicatorName('overview'));

  await page.goto(`/dashboard/indicators/${id}`);
  await expect(page.getByText('Scheduled publication date:')).toHaveCount(0);

  // The sample answers ask for 09:30 UK time on 1 April next year.
  await completeDraft(page, id);
  await page.goto(`/dashboard/indicators/${id}`);

  await expect(page.getByRole('main').locator('p:has(.govuk-tag) + p')).toHaveText(
    `Scheduled publication date: 1 April ${new Date().getFullYear() + 1} at 9:30am`,
  );
});

test('answers an indicator that does not exist with the not-found page', async ({ page }) => {
  for (const path of [
    '/dashboard/indicators/108',
    '/dashboard/indicators/00000000-0000-7000-8000-000000000000',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  }
});

test('has no WCAG 2.2 AA violations for a draft', async ({ page }, testInfo) => {
  const name = uniqueIndicatorName('overview');
  const id = await createDraft(page, name);

  await page.goto(`/dashboard/indicators/${id}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('as an admin, who sees the seeded indicators in Fingertips', () => {
  test.use({ storageState: ADMIN.storageState });

  test('shows a published indicator as live and published', async ({ page }) => {
    await page.goto(PUBLISHED_OVERVIEW_PATH);

    await expect(page.getByRole('heading', { level: 1, name: MORTALITY_NAME })).toBeVisible();
    // The tags follow the public number, under the heading.
    await expect(page.getByRole('main').locator('h1 ~ p .govuk-tag')).toHaveText([
      'Indicator status: Live indicator',
      'Publishing status: Published',
    ]);
  });

  test('opens the published indicator from the actions tab', async ({ page }) => {
    await page.goto(PUBLISHED_OVERVIEW_PATH);

    await expect(page.getByRole('tab', { name: 'Actions' })).toBeVisible();
    await page.getByRole('link', { name: 'View published indicator' }).click();

    await expect(page).toHaveURL(/\/indicator\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { level: 1, name: MORTALITY_NAME })).toBeVisible();
  });

  test('goes back to the dashboard', async ({ page }) => {
    await page.goto(PUBLISHED_OVERVIEW_PATH);

    await page.getByRole('link', { name: 'Back to indicators', exact: true }).click();

    await expect(page).toHaveURL('/dashboard');
  });

  test('has no WCAG 2.2 AA violations for a published indicator', async ({ page }, testInfo) => {
    await page.goto(PUBLISHED_OVERVIEW_PATH);
    await expect(page.getByRole('heading', { level: 1, name: MORTALITY_NAME })).toBeVisible();

    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('lets an admin see an indicator without offering its task list', async ({
    browser,
    page,
  }) => {
    const name = uniqueIndicatorName('overview');
    const publisher = await browser.newContext({ storageState: PUBLISHER.storageState });
    const id = await createDraft(await publisher.newPage(), name);
    await publisher.close();

    await page.goto(`/dashboard/indicators/${id}`);

    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Continue/ })).toHaveCount(0);
    await expect(
      page.getByText('There are no actions available for this indicator yet.'),
    ).toBeVisible();
  });
});

test.describe('as a publisher in another team', () => {
  test.use({ storageState: TEAM_B_PUBLISHER.storageState });

  test("answers another team's indicator with the not-found page", async ({ browser, page }) => {
    const publisher = await browser.newContext({ storageState: PUBLISHER.storageState });
    const id = await createDraft(await publisher.newPage(), uniqueIndicatorName('overview'));
    await publisher.close();

    const response = await page.goto(`/dashboard/indicators/${id}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});

test('hides an indicator in Fingertips from a publisher', async ({ page }) => {
  const response = await page.goto(PUBLISHED_OVERVIEW_PATH);

  expect(response?.status()).toBe(404);
});
