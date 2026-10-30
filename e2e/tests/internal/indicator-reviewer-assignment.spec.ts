import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { addReviewer, chooseReviewer } from '../support/assign-reviewers.ts';
import { submitNewIndicator } from '../support/complete-draft.ts';
import { uniqueIndicatorName } from '../support/create-indicator.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import { IMRG_MANAGER, PUBLISHER } from '../support/sign-in.ts';

const ASSIGNED = 'Reviewers successfully assigned to indicator.';
const NOT_WITHDRAWN = 'This submission can no longer be withdrawn.';

function overviewPath(id: string) {
  return `/dashboard/indicators/${id}`;
}

function assignPath(id: string) {
  return `${overviewPath(id)}/assign-reviewers`;
}

/** The reviewers listed so far, read from their Remove buttons in page order. */
function removeButtons(page: Page) {
  return page.getByRole('button', { name: /^Remove reviewer / });
}

/** The manager's dashboard row for the indicator in the table named. */
function dashboardRow(page: Page, table: 'Unassigned' | 'Assigned', name: string) {
  return page
    .getByRole('table', { name: `${table} indicators, oldest submission first` })
    .getByRole('row')
    .filter({ hasText: name });
}

test.use({ storageState: IMRG_MANAGER.storageState });

test('assigns reviewers to an indicator opened from Unassigned indicators', async ({
  browser,
  page,
}, testInfo) => {
  const name = uniqueIndicatorName('assign reviewers');
  const id = await submitNewIndicator(browser, name);
  await page.goto('/dashboard');
  await dashboardRow(page, 'Unassigned', name).getByRole('link', { name }).click();

  await page.getByRole('button', { name: 'Assign reviewers to indicator' }).click();
  await expect(page).toHaveURL(assignPath(id));
  await addReviewer(page, 'Morgan Hughes');
  await addReviewer(page, 'Jamie Evans');
  await expectNoAccessibilityViolations(page, testInfo);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(overviewPath(id));
  await expect(page.getByRole('alert')).toContainText(ASSIGNED);
  await expect(
    page.getByRole('link', { name: 'Change reviewers for this indicator' }),
  ).toBeVisible();
  await page.goto('/dashboard');
  await expect(dashboardRow(page, 'Assigned', name).getByRole('listitem')).toHaveText([
    'Jamie Evans',
    'Morgan Hughes',
  ]);
  await expect(dashboardRow(page, 'Unassigned', name)).toHaveCount(0);
});

test('changes the reviewers of an indicator in review', async ({ browser, page }) => {
  const name = uniqueIndicatorName('change reviewers');
  const id = await submitNewIndicator(browser, name);
  await page.goto(assignPath(id));
  await addReviewer(page, 'Morgan Hughes');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText(ASSIGNED);

  await page.getByRole('link', { name: 'Change reviewers for this indicator' }).click();
  await expect(removeButtons(page)).toHaveText(['Remove reviewer Morgan Hughes']);
  await page.getByRole('button', { name: 'Remove reviewer Morgan Hughes' }).click();
  await addReviewer(page, 'Jamie Evans');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(overviewPath(id));
  await expect(page.getByRole('alert')).toContainText(ASSIGNED);
  await page.goto('/dashboard');
  await expect(dashboardRow(page, 'Assigned', name).getByRole('listitem')).toHaveText([
    'Jamie Evans',
  ]);
});

test('asks for a reviewer when none is chosen', async ({ browser, page }, testInfo) => {
  const id = await submitNewIndicator(browser, uniqueIndicatorName('no reviewer'));
  await page.goto(assignPath(id));
  await expect(page.getByRole('heading', { level: 1, name: 'Assign reviewers' })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveTitle(/^Error: Assign reviewers/);
  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Select a reviewer']);
  await expectNoAccessibilityViolations(page, testInfo);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: 'Select a reviewer' }).click();
  await expect(page.getByLabel('Reviewer', { exact: true })).toBeFocused();
});

test('once reviewers are assigned, the publisher can no longer withdraw the submission', async ({
  browser,
  page,
}) => {
  const id = await submitNewIndicator(browser, uniqueIndicatorName('no withdrawal'));
  await page.goto(assignPath(id));
  await chooseReviewer(page, 'Jamie Evans');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(ASSIGNED)).toBeVisible();

  const publisher = await (
    await browser.newContext({ storageState: PUBLISHER.storageState })
  ).newPage();
  await publisher.goto(overviewPath(id));
  await expect(publisher.getByRole('heading', { level: 2, name: 'Actions' })).toBeVisible();
  await expect(publisher.getByRole('link', { name: 'Withdraw submission' })).toHaveCount(0);

  await publisher.goto(`/publish/indicators/${id}/withdraw-submission`);
  await expect(publisher).toHaveURL(overviewPath(id));
  await expect(publisher.getByRole('region', { name: 'Important' })).toContainText(NOT_WITHDRAWN);
  await publisher.context().close();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('adds and removes reviewers, then assigns them', async ({ browser, page }) => {
    const id = await submitNewIndicator(browser, uniqueIndicatorName('no script'));
    await page.goto(assignPath(id));

    await addReviewer(page, 'Morgan Hughes');
    await addReviewer(page, 'Jamie Evans');
    await expect(removeButtons(page)).toHaveText([
      'Remove reviewer Morgan Hughes',
      'Remove reviewer Jamie Evans',
    ]);
    await page.getByRole('button', { name: 'Remove reviewer Morgan Hughes' }).click();
    await expect(removeButtons(page)).toHaveText(['Remove reviewer Jamie Evans']);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(overviewPath(id));
    await expect(page.getByText(ASSIGNED)).toBeVisible();
  });
});
