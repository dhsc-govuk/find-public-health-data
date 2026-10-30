import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { assignReviewers } from '../support/assign-reviewers.ts';
import { submitNewIndicator } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import {
  ADMIN,
  IMRG_MANAGER,
  IMRG_REVIEWER,
  PUBLISHER,
  PUBLISHER_AND_REVIEWER,
  TEAM_B_PUBLISHER,
} from '../support/sign-in.ts';

test.use({ storageState: PUBLISHER.storageState });

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard');
});

test('tags a new indicator as new with an incomplete draft', async ({ page }) => {
  const name = uniqueIndicatorName('dashboard');
  await createDraft(page, name);
  await page.goto('/dashboard');

  const row = page.getByRole('table').getByRole('row').filter({ hasText: name });

  // The column headers name the two statuses, so the tags carry no hidden prefix here.
  await expect(row.locator('.govuk-tag')).toHaveText(['New', 'Incomplete']);
});

test('names the team, the creator and the last editor of a new indicator', async ({ page }) => {
  const name = uniqueIndicatorName('dashboard');
  await createDraft(page, name);
  await page.goto('/dashboard');

  const row = page.getByRole('table').getByRole('row').filter({ hasText: name });

  await expect(row.getByRole('cell').nth(0)).toHaveText('Team A');
  await expect(row.getByRole('cell').nth(1)).toHaveText(PUBLISHER.name);
  await expect(row.getByRole('cell').nth(3)).toHaveText(PUBLISHER.name);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('as a publisher whose team holds no indicators', () => {
  test.use({ storageState: TEAM_B_PUBLISHER.storageState });

  test("shows a publisher only their own teams' indicators", async ({ page }) => {
    await expect(page.getByText('There are no indicators for you to see yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create new indicator' })).toBeVisible();
  });
});

test.describe('as an admin, who sees every team', () => {
  test.use({ storageState: ADMIN.storageState });

  // The seed holds more indicators than one page, all in Fingertips, and specs only add to it.
  test('lists a page of indicators', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Indicators' })).toBeVisible();

    const rows = page.getByRole('table').getByRole('row');

    await expect(rows).toHaveCount(11);
    await expect(rows.first().getByRole('columnheader')).toHaveText([
      'Indicator name',
      'Team',
      'Created by',
      'Last edited',
      'Last edited by',
      'Indicator status',
      'Publishing status',
    ]);
  });

  test('moves between pages', async ({ page }) => {
    await page.getByRole('link', { name: 'Next page' }).click();

    await expect(page).toHaveURL('/dashboard?page=2');
    await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible();

    await page.getByRole('link', { name: 'Previous page' }).click();

    await expect(page).toHaveURL('/dashboard');
  });

  test('offers an admin no create action', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create new indicator' })).toHaveCount(0);
  });
});

test.describe('as an IMRG manager', () => {
  test.use({ storageState: IMRG_MANAGER.storageState });

  test('shows the indicators under review, unassigned and assigned', async ({ page }) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Indicators under review' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Unassigned indicators' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Assigned indicators', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create new indicator' })).toHaveCount(0);
  });

  test('lists a submitted indicator as unassigned, linked to its overview', async ({
    browser,
    page,
  }, testInfo) => {
    const name = uniqueIndicatorName('under review');
    const id = await submitNewIndicator(browser, name);

    await page.goto('/dashboard');
    const row = page
      .getByRole('table', { name: 'Unassigned indicators, oldest submission first' })
      .getByRole('row')
      .filter({ hasText: name });

    await expect(row.locator('.govuk-tag')).toHaveText(['New', 'Pending approval']);
    await expectNoAccessibilityViolations(page, testInfo);

    await row.getByRole('link', { name }).click();

    await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
  });
});

test.describe('as an IMRG reviewer', () => {
  test.use({ storageState: IMRG_REVIEWER.storageState });

  /** The reviewer's row for the indicator named. */
  function reviewRow(page: Page, name: string) {
    return page
      .getByRole('table', { name: 'Indicators to review, oldest submission first' })
      .getByRole('row')
      .filter({ hasText: name });
  }

  test('shows an IMRG reviewer the indicators assigned to them, without tabs', async ({
    browser,
    page,
  }, testInfo) => {
    const name = uniqueIndicatorName('to review');
    const id = await submitNewIndicator(browser, name);
    await assignReviewers(browser, id, [IMRG_REVIEWER.name, PUBLISHER_AND_REVIEWER.name]);

    await page.goto('/dashboard');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Indicators under review' }),
    ).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    const row = reviewRow(page, name);
    await expect(row.getByRole('listitem')).toHaveText([
      IMRG_REVIEWER.name,
      PUBLISHER_AND_REVIEWER.name,
    ]);
    await expect(row.locator('.govuk-tag')).toHaveText(['New', 'Pending approval']);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('an assigned reviewer opens the indicator overview, with no actions', async ({
    browser,
    page,
  }, testInfo) => {
    const name = uniqueIndicatorName('reviewer overview');
    const id = await submitNewIndicator(browser, name);
    await assignReviewers(browser, id, [IMRG_REVIEWER.name]);

    await page.goto('/dashboard');
    await reviewRow(page, name).getByRole('link', { name }).click();

    await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(
      page.getByText('There are no actions available for this indicator yet.'),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test("a reviewer can't open an indicator assigned to someone else", async ({ browser, page }) => {
    const name = uniqueIndicatorName('not assigned');
    const id = await submitNewIndicator(browser, name);
    await assignReviewers(browser, id, [PUBLISHER_AND_REVIEWER.name]);

    await page.goto('/dashboard');
    await expect(reviewRow(page, name)).toHaveCount(0);

    const response = await page.goto(`/dashboard/indicators/${id}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});

test.describe('as an IMRG reviewer who publishes', () => {
  test.use({ storageState: PUBLISHER_AND_REVIEWER.storageState });

  test('offers a Review tab and a Create and edit tab', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Indicators' })).toBeVisible();
    // Other specs assign this reviewer too, so the count is whatever they have left.
    await expect(page.getByRole('tab')).toHaveText([/^Review( \(\d+\))?$/, 'Create and edit']);

    await page.getByRole('tab', { name: 'Create and edit' }).click();

    await expect(
      page
        .getByRole('tabpanel', { name: 'Create and edit' })
        .getByRole('button', { name: 'Create new indicator' }),
    ).toBeVisible();
  });
});
