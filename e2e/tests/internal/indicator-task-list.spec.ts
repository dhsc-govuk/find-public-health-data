import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { shownVersion } from '../support/complete-draft.ts';
import { createDraft, createIndicator, uniqueIndicatorName } from '../support/create-indicator.ts';
import { expectNotFoundWithoutDraft, taskRow } from '../support/section-page.ts';
import { PUBLISHER, TEAM_B_PUBLISHER } from '../support/sign-in.ts';

const DATA_TABLE = 'Data table';

/** A draft's task rows, in the order the task list shows them. */
const TASK_GROUPS = {
  Data: [
    DATA_TABLE,
    'Value type and units',
    'Sex and ages',
    'Period type',
    'Polarity',
    'Data quality',
  ],
  Metadata: [
    'Name',
    'Definition and rationale',
    'Numerator',
    'Denominator',
    'How the indicator was calculated',
    'Confidence intervals',
    'Benchmarking',
    'Other notes and caveats',
    'Links',
    'Tagging',
    'Copyright and data re-use',
  ],
  Publishing: ['Update frequency', 'Publishing date'],
  'Notes for reviewers (for internal use only)': [
    'Variance and quality',
    'Justifications',
    'Other comments',
  ],
};
const TASKS = Object.values(TASK_GROUPS).flat();

function uniqueName() {
  return uniqueIndicatorName('task list');
}

test.use({ storageState: PUBLISHER.storageState });

test('lists the fields a publisher completes, grouped', async ({ page }) => {
  await createIndicator(page, uniqueName());

  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(
    Object.keys(TASK_GROUPS),
  );
  const rows = page.getByRole('main').getByRole('listitem');
  await expect(rows).toHaveCount(TASKS.length);
  await expect(rows).toContainText(TASKS);
});

test('shows the indicator name and number on its task list', async ({ page }) => {
  const name = uniqueName();

  await createIndicator(page, name);

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText(/^ID: \d+$/)).toBeVisible();
});

test('shows the indicator as new with an incomplete draft', async ({ page }) => {
  await createIndicator(page, uniqueName());

  // The tags follow the public number, under the heading.
  await expect(page.getByRole('main').locator('h1 ~ p .govuk-tag')).toHaveText([
    'Indicator status: New indicator',
    'Publishing status: Incomplete',
  ]);
});

test('offers no submission while a task is incomplete', async ({ page }) => {
  await createIndicator(page, uniqueName());

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit for approval' })).toHaveCount(0);
});

test('marks the name as complete and everything else as not started', async ({ page }) => {
  await createIndicator(page, uniqueName());

  await expect(taskRow(page, 'Name')).toContainText('Completed');
  for (const taskName of TASKS.filter((name) => name !== 'Name')) {
    await expect(taskRow(page, taskName)).toContainText('Not started');
  }
  for (const taskName of TASKS) {
    await expect(taskRow(page, taskName).getByRole('link')).toBeVisible();
  }
});

test('opens the name from the task list and comes back to it renamed', async ({ page }) => {
  const name = uniqueName();
  await createIndicator(page, name);
  const taskListPath = new URL(page.url()).pathname;

  await taskRow(page, 'Name').getByRole('link').click();

  await expect(page).toHaveURL(/\/publish\/indicators\/[0-9a-f-]{36}\/name$/);
  const field = page.getByLabel('What is the name of the indicator?');
  await expect(field).toHaveValue(name);

  await field.fill(`${name} revised`);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(page.getByRole('heading', { level: 1, name: `${name} revised` })).toBeVisible();
});

test('is reached from the indicator overview', async ({ page }) => {
  await createIndicator(page, uniqueName());
  const taskListPath = new URL(page.url()).pathname;

  await page.getByRole('link', { name: 'Back to indicator overview', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/indicators\/[0-9a-f-]{36}$/);

  await page.getByRole('link', { name: 'Continue creating indicator' }).click();

  await expect(page).toHaveURL(taskListPath);
});

test('fills in the remaining tasks with sample answers, ready to submit', async ({
  page,
}, testInfo) => {
  await createIndicator(page, uniqueName());
  const taskListPath = new URL(page.url()).pathname;

  await page
    .getByRole('button', { name: 'Fill in the remaining tasks with sample answers' })
    .click();

  // The rows wait for the fill to finish; the address alone would match before it had begun.
  for (const taskName of TASKS) {
    await expect(taskRow(page, taskName)).toContainText('Completed');
  }
  await expect(page).toHaveURL(taskListPath);
  await expect(page.getByRole('button', { name: /sample answers/ })).toHaveCount(0);
  await expectNoAccessibilityViolations(page, testInfo);

  await page.getByRole('button', { name: 'Submit for approval' }).click();

  await expect(page).toHaveURL(/\/dashboard\/indicators\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Indicator successfully submitted for approval.')).toBeVisible();
});

test('keeps the answers to tasks already complete when filling in the rest', async ({ page }) => {
  const id = await createDraft(page, uniqueName());
  const polarityPath = `/publish/indicators/${id}/polarity`;
  const polarity = await page.request.post(polarityPath, {
    form: { polarity: 'higher-is-better', version: await shownVersion(page, polarityPath) },
    maxRedirects: 0,
  });
  expect(polarity.headers().location).toBe(`/publish/indicators/${id}/task-list`);
  await page.goto(`/publish/indicators/${id}/task-list`);

  await page
    .getByRole('button', { name: 'Fill in the remaining tasks with sample answers' })
    .click();
  await expect(taskRow(page, 'Polarity')).toContainText('Completed');
  await page.goto(`/publish/indicators/${id}/polarity`);

  await expect(page.getByRole('radio', { name: 'Higher is better' })).toBeChecked();
});

test('answers an indicator with nothing to edit with the not-found page', async ({ page }) => {
  await expectNotFoundWithoutDraft(page, 'task-list');
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await createIndicator(page, uniqueName());

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('as a publisher in another team', () => {
  test.use({ storageState: TEAM_B_PUBLISHER.storageState });

  test("answers another team's draft with the not-found page, on every publishing page", async ({
    browser,
    page,
  }) => {
    const publisher = await browser.newContext({ storageState: PUBLISHER.storageState });
    const id = await createDraft(await publisher.newPage(), uniqueIndicatorName('task-list'));
    await publisher.close();

    for (const section of ['task-list', 'name', 'data-table', 'definition-and-rationale']) {
      const response = await page.goto(`/publish/indicators/${id}/${section}`);
      expect(response?.status(), section).toBe(404);
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});
