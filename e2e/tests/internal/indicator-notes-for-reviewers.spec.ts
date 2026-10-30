import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { assignReviewers } from '../support/assign-reviewers.ts';
import { submitNewIndicator } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { IMRG_MANAGER, IMRG_REVIEWER, PUBLISHER } from '../support/sign-in.ts';

// The sample answers a submitted indicator carries ask for 09:30 UK time on 1 April next year.
const SCHEDULED = `Scheduled publication date: 1 April ${new Date().getFullYear() + 1} at 9:30am`;

async function openOverview(page: Page, id: string) {
  await page.goto(`/dashboard/indicators/${id}`);
  await expect(page.getByRole('main').locator('p:has(.govuk-tag) + p')).toHaveText(SCHEDULED);
}

function answerTo(page: Page, question: string) {
  return page
    .locator('.govuk-summary-list__row')
    .filter({ has: page.getByText(question, { exact: true }) })
    .locator('dd');
}

/** Opens the tab and checks a few of the sample answers in it. */
async function expectNotesForReviewers(page: Page) {
  await page.getByRole('tab', { name: 'Notes for reviewers' }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Notes for reviewers' })).toBeVisible();
  await expect(answerTo(page, 'How does the indicator vary?')).toHaveText('Little.');
  await expect(answerTo(page, 'Have there been any exclusions?')).toHaveText('No');
  await expect(answerTo(page, 'Sponsors or stakeholders')).toHaveText('Not provided');
  await expect(answerTo(page, 'Other comments')).toHaveText('None');
}

test.describe('as the publisher', () => {
  test.use({ storageState: PUBLISHER.storageState });

  test('shows the publisher what they submitted for the reviewers', async ({
    browser,
    page,
  }, testInfo) => {
    const id = await submitNewIndicator(browser, uniqueIndicatorName('notes'));

    await openOverview(page, id);
    await expect(page.getByRole('tab')).toHaveText(['Actions', 'Notes for reviewers']);
    await expectNotesForReviewers(page);

    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('shows no Notes for reviewers tab before the draft is submitted', async ({ page }) => {
    const id = await createDraft(page, uniqueIndicatorName('notes'));

    await page.goto(`/dashboard/indicators/${id}`);

    await expect(page.getByRole('tab')).toHaveText(['Actions']);
  });

  test('shows no Notes for reviewers tab once the submission is withdrawn', async ({
    browser,
    page,
  }) => {
    const id = await submitNewIndicator(browser, uniqueIndicatorName('notes'));

    await openOverview(page, id);
    await page.getByRole('link', { name: 'Withdraw submission' }).click();
    await page.getByRole('button', { name: 'Withdraw submission' }).click();

    await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
    await expect(page.getByRole('tab')).toHaveText(['Actions']);
  });
});

test.describe('as the IMRG manager', () => {
  test.use({ storageState: IMRG_MANAGER.storageState });

  test('shows the IMRG manager the scheduled publication date and Notes for reviewers tab', async ({
    browser,
    page,
  }) => {
    const id = await submitNewIndicator(browser, uniqueIndicatorName('notes'));

    await openOverview(page, id);
    await expectNotesForReviewers(page);
  });
});

test.describe('as an IMRG reviewer', () => {
  test.use({ storageState: IMRG_REVIEWER.storageState });

  test("shows the indicator's reviewers the scheduled publication date and Notes for reviewers tab", async ({
    browser,
    page,
  }) => {
    const id = await submitNewIndicator(browser, uniqueIndicatorName('notes'));
    await assignReviewers(browser, id, [IMRG_REVIEWER.name]);

    await openOverview(page, id);
    await expectNotesForReviewers(page);
  });
});
