import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { completeDraft, shownVersion } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const SUBMITTED = 'Indicator successfully submitted for approval.';
const LOCKED = 'This indicator has been submitted for approval and cannot be edited.';
const WITHDRAWN = 'Submission withdrawn. You can now edit the indicator.';
const NOT_WITHDRAWN = 'This submission can no longer be withdrawn.';
const CHANGED =
  'This indicator has changed since you opened this page. Check the changes, then submit again.';

test.use({ storageState: PUBLISHER.storageState });

/** Creates a draft with every task complete and opens its task list; returns its id. */
async function openCompleteTaskList(page: Page): Promise<string> {
  const id = await createDraft(page, uniqueIndicatorName('submission'));
  await completeDraft(page, id);
  await page.goto(taskListPath(id));
  return id;
}

function taskListPath(id: string) {
  return `/publish/indicators/${id}/task-list`;
}

function overviewPath(id: string) {
  return `/dashboard/indicators/${id}`;
}

function publishingTag(page: Page) {
  return page.getByRole('main').locator('h1 ~ p .govuk-tag').nth(1);
}

async function submit(page: Page, id: string) {
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page).toHaveURL(overviewPath(id));
}

test('submitting from a complete task list lands on the overview with the banner and the Pending approval tag', async ({
  page,
}, testInfo) => {
  const id = await openCompleteTaskList(page);
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'By continuing, you confirm that you have checked all data and metadata is correct.',
    }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);

  await submit(page, id);

  await expect(page.getByText(SUBMITTED)).toBeVisible();
  await expect(publishingTag(page)).toHaveText('Publishing status: Pending approval');
  await expect(page.getByRole('link', { name: 'Continue creating indicator' })).toHaveCount(0);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('the task list of a submitted indicator redirects to the overview with the message', async ({
  page,
}, testInfo) => {
  const id = await openCompleteTaskList(page);
  await submit(page, id);

  await page.goto(taskListPath(id));

  await expect(page).toHaveURL(overviewPath(id));
  await expect(page.getByRole('region', { name: 'Important' })).toContainText(LOCKED);
  await expectNoAccessibilityViolations(page, testInfo);
});

test("a teammate's edit after the task list loaded makes submit return to the task list with the changed message", async ({
  page,
}, testInfo) => {
  const id = await openCompleteTaskList(page);
  const polarityPath = `/publish/indicators/${id}/polarity`;
  const edited = await page.request.post(polarityPath, {
    form: { polarity: 'higher-is-better', version: await shownVersion(page, polarityPath) },
    maxRedirects: 0,
  });
  expect(edited.headers().location).toBe(taskListPath(id));

  await page.getByRole('button', { name: 'Submit for approval' }).click();

  await expect(page).toHaveURL(taskListPath(id));
  await expect(page.getByRole('alert')).toContainText(CHANGED);
  await expectNoAccessibilityViolations(page, testInfo);

  await submit(page, id);
  await expect(page.getByText(SUBMITTED)).toBeVisible();
});

test('opening or saving a section of a locked draft redirects to the overview with the message', async ({
  page,
  context,
}) => {
  const id = await openCompleteTaskList(page);
  const section = await context.newPage();
  await section.goto(`/publish/indicators/${id}/polarity`);

  await submit(page, id);
  await section.getByLabel('Higher is better', { exact: true }).check();
  await section.getByRole('button', { name: 'Continue' }).click();

  await expect(section).toHaveURL(overviewPath(id));
  await expect(section.getByRole('region', { name: 'Important' })).toContainText(LOCKED);

  await section.goto(`/publish/indicators/${id}/definition-and-rationale`);
  await expect(section).toHaveURL(overviewPath(id));
  await expect(section.getByRole('region', { name: 'Important' })).toContainText(LOCKED);
});

test("withdrawing from the overview's actions, through the confirmation page, lands on the overview with the banner and Incomplete", async ({
  page,
}, testInfo) => {
  const id = await openCompleteTaskList(page);
  await submit(page, id);

  await page.getByRole('link', { name: 'Withdraw submission' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Are you sure you want to withdraw this submission?',
    }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
  await page.getByRole('button', { name: 'Withdraw submission' }).click();

  await expect(page).toHaveURL(overviewPath(id));
  await expect(page.getByText(WITHDRAWN)).toBeVisible();
  await expect(publishingTag(page)).toHaveText('Publishing status: Incomplete');
  await expectNoAccessibilityViolations(page, testInfo);

  // The task list is open again, and the draft can be submitted again.
  await page.getByRole('link', { name: 'Continue creating indicator' }).click();
  await expect(page).toHaveURL(taskListPath(id));
  await submit(page, id);
  await expect(page.getByText(SUBMITTED)).toBeVisible();
});

test('the confirmation page cancels back to the overview', async ({ page }) => {
  const id = await openCompleteTaskList(page);
  await submit(page, id);
  await page.getByRole('link', { name: 'Withdraw submission' }).click();

  await page.getByRole('link', { name: 'Cancel' }).click();

  await expect(page).toHaveURL(overviewPath(id));
  await expect(publishingTag(page)).toHaveText('Publishing status: Pending approval');
});

test('a confirmation page left open does not withdraw a submission made since', async ({
  page,
  context,
}) => {
  const id = await openCompleteTaskList(page);
  await submit(page, id);
  const stale = await context.newPage();
  await stale.goto(`/publish/indicators/${id}/withdraw-submission`);

  await page.getByRole('link', { name: 'Withdraw submission' }).click();
  await page.getByRole('button', { name: 'Withdraw submission' }).click();
  await expect(page).toHaveURL(overviewPath(id));
  await page.goto(taskListPath(id));
  await submit(page, id);
  await stale.getByRole('button', { name: 'Withdraw submission' }).click();

  await expect(stale).toHaveURL(overviewPath(id));
  await expect(stale.getByRole('region', { name: 'Important' })).toContainText(NOT_WITHDRAWN);
  await expect(publishingTag(stale)).toHaveText('Publishing status: Pending approval');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('submits and withdraws an indicator', async ({ page }) => {
    const id = await openCompleteTaskList(page);

    await submit(page, id);
    await expect(page.getByText(SUBMITTED)).toBeVisible();

    await page.getByRole('link', { name: 'Withdraw submission' }).click();
    await page.getByRole('button', { name: 'Withdraw submission' }).click();
    await expect(page).toHaveURL(overviewPath(id));
    await expect(page.getByText(WITHDRAWN)).toBeVisible();
  });
});
