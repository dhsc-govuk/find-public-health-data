import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { PUBLISHER } from '../support/sign-in.ts';

// The page belongs to an update of a live indicator, which only the publishing project can make.
// These tests open it on a new indicator's draft by its address, to check the page itself; the
// publishing project's update spec reaches it from an update's task list.
test.use({ storageState: PUBLISHER.storageState });

const TITLE = 'What is the summary of this update?';

test('asks for a summary for the indicator history and more for the reviewers', async ({
  page,
}, testInfo) => {
  const id = await createDraft(page, uniqueIndicatorName('update summary'));

  await page.goto(`/publish/indicators/${id}/update-summary`);

  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByLabel('Update summary for consumer-facing indicator history')).toBeEmpty();
  await expect(
    page.getByLabel('Additional summary information for internal reviewers (optional)'),
  ).toBeEmpty();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('says "Enter a summary of this update" without a summary, keeping what was typed', async ({
  page,
}, testInfo) => {
  const id = await createDraft(page, uniqueIndicatorName('update summary'));
  await page.goto(`/publish/indicators/${id}/update-summary`);

  await page
    .getByLabel('Additional summary information for internal reviewers (optional)')
    .fill('Only for the reviewers.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveTitle(/^Error: What is the summary of this update\?/);
  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link', { name: 'Enter a summary of this update' })).toBeVisible();
  await expect(
    page.getByLabel('Additional summary information for internal reviewers (optional)'),
  ).toHaveValue('Only for the reviewers.');
  await expectNoAccessibilityViolations(page, testInfo);
});

test('saves the summary and returns to the task list', async ({ page }) => {
  const id = await createDraft(page, uniqueIndicatorName('update summary'));
  await page.goto(`/publish/indicators/${id}/update-summary`);

  await page
    .getByLabel('Update summary for consumer-facing indicator history')
    .fill('Added the 2024 data.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(`/publish/indicators/${id}/task-list`);

  await page.goto(`/publish/indicators/${id}/update-summary`);
  await expect(page.getByLabel('Update summary for consumer-facing indicator history')).toHaveValue(
    'Added the 2024 data.',
  );
});
