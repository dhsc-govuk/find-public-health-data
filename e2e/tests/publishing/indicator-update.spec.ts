import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { historyEntries, historyToday, openHistory } from '../support/history.ts';
import { MINUTE, publicIndicatorUrl, publishedIndicator } from '../support/published-indicator.ts';
import { PUBLISHER } from '../support/sign-in.ts';

// Only a publication gives a publisher a live indicator of their own, so the tests share one and
// run in order: the first starts its update, and the rest work on it.
test.describe.configure({ mode: 'serial' });
test.use({ storageState: PUBLISHER.storageState });

let indicator: { id: string; name: string };

test.beforeAll(async ({ browser }) => {
  // Approving the indicator and waiting for the worker to publish it takes up to three minutes.
  test.setTimeout(4 * MINUTE);
  indicator = await publishedIndicator(browser, 'update');
});

function overviewPath() {
  return `/dashboard/indicators/${indicator.id}`;
}

function taskListPath() {
  return `/publish/indicators/${indicator.id}/task-list`;
}

function statusTags(page: Page) {
  return page.getByRole('main').locator('h1 ~ p .govuk-tag');
}

/** The status beside a task on the task list, found by its title whether or not it links. */
function taskStatus(page: Page, title: string) {
  return page
    .locator('.govuk-task-list__item')
    .filter({ has: page.getByText(title, { exact: true }) })
    .locator('.govuk-task-list__status');
}

/** Saves the polarity page with the answer given, which returns to the task list. */
async function savePolarity(page: Page, answer: string) {
  await page.goto(`/publish/indicators/${indicator.id}/polarity`);
  await page.getByLabel(answer, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath());
}

test('a live indicator with no draft gets "Update indicator", which opens a draft and goes to the update task list', async ({
  page,
}, testInfo) => {
  await page.goto(overviewPath());
  await expect(statusTags(page)).toHaveText([
    'Indicator status: Live indicator',
    'Publishing status: Published',
  ]);
  await expectNoAccessibilityViolations(page, testInfo);

  await page.getByRole('button', { name: 'Update indicator' }).click();

  await expect(page).toHaveURL(taskListPath());
  await expect(page.getByRole('heading', { level: 1, name: indicator.name })).toBeVisible();
});

test('with a draft open, the Actions tab shows "Continue updating indicator" and the overview shows "Live indicator" and "Update incomplete"', async ({
  page,
}, testInfo) => {
  await page.goto(overviewPath());

  await expect(statusTags(page)).toHaveText([
    'Indicator status: Live indicator',
    'Publishing status: Update incomplete',
  ]);
  await expect(page.getByRole('button', { name: 'Update indicator' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Continue updating indicator' })).toHaveAttribute(
    'href',
    taskListPath(),
  );
  await expectNoAccessibilityViolations(page, testInfo);
});

test('the view link reads "View live indicator"', async ({ page }) => {
  await page.goto(overviewPath());

  await expect(page.getByRole('link', { name: 'View live indicator' })).toHaveAttribute(
    'href',
    new URL(publicIndicatorUrl(indicator.name)).pathname,
  );
});

test('the dashboard and the task list show "Live indicator" and "Update incomplete"', async ({
  page,
}) => {
  await page.goto('/dashboard');
  const row = page.getByRole('table').getByRole('row').filter({ hasText: indicator.name });
  // The column headers name the two statuses, so the tags carry no hidden prefix here.
  await expect(row.locator('.govuk-tag')).toHaveText(['Live', 'Update incomplete']);

  await page.goto(taskListPath());
  await expect(statusTags(page)).toHaveText([
    'Indicator status: Live indicator',
    'Publishing status: Update incomplete',
  ]);
});

test('the History tab shows "Indicator update started"', async ({ page }) => {
  await openHistory(page, indicator.id);

  await expect(historyEntries(page).first()).toHaveText(
    `${historyToday()} Indicator update started By ${PUBLISHER.name}`,
    { useInnerText: true },
  );
});

test('every task but the publishing date and update summary reads "Unchanged" against the live indicator, and those two have "No changes to publish"', async ({
  page,
}, testInfo) => {
  await page.goto(taskListPath());

  await expect(taskStatus(page, 'Polarity')).toHaveText('Unchanged');
  await expect(taskStatus(page, 'Data table')).toHaveText('Unchanged');
  await expect(taskStatus(page, 'Other comments')).toHaveText('Unchanged');
  for (const title of ['Publishing date', 'Update summary']) {
    await expect(taskStatus(page, title)).toHaveText('No changes to publish');
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

test('a changed task reads "Changed", and the publishing date and update summary become links reading "Incomplete"', async ({
  page,
}, testInfo) => {
  await savePolarity(page, 'Higher is better');

  await expect(taskStatus(page, 'Polarity')).toHaveText('Changed');
  await expect(taskStatus(page, 'Definition and rationale')).toHaveText('Unchanged');
  for (const title of ['Publishing date', 'Update summary']) {
    await expect(taskStatus(page, title)).toHaveText('Incomplete');
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

test('the update summary page asks "What is the summary of this update?", and reads "Complete" once saved', async ({
  page,
}, testInfo) => {
  await page.goto(taskListPath());
  await page.getByRole('link', { name: 'Update summary', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'What is the summary of this update?' }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);

  await page
    .getByLabel('Update summary for consumer-facing indicator history')
    .fill('Polarity corrected to higher is better.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath());
  await expect(taskStatus(page, 'Update summary')).toHaveText('Complete');
});

test('on an update the publishing date page asks "When should this update be published?", and reads "Complete" once saved', async ({
  page,
}, testInfo) => {
  await page.goto(taskListPath());
  await page.getByRole('link', { name: 'Publishing date', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'When should this update be published?' }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);

  const date = page.getByRole('group', { name: 'Date' });
  await date.getByLabel('Day', { exact: true }).fill('1');
  await date.getByLabel('Month', { exact: true }).fill('4');
  await date.getByLabel('Year', { exact: true }).fill(String(new Date().getFullYear() + 2));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath());
  await expect(taskStatus(page, 'Publishing date')).toHaveText('Complete');
});

test('a task saved back to its live answers reads "Unchanged" again', async ({ page }) => {
  await savePolarity(page, 'Lower is better');

  await expect(taskStatus(page, 'Polarity')).toHaveText('Unchanged');
  await expect(taskStatus(page, 'Publishing date')).toHaveText('No changes to publish');
  await expect(taskStatus(page, 'Update summary')).toHaveText('No changes to publish');
});

test('an update is not offered for review while no task is changed', async ({ page }) => {
  await page.goto(taskListPath());

  await expect(page.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);
});

test('an update can be submitted once at least one task is "Changed" and the publishing date and update summary are complete, and the overview\'s banner reads "Update successfully submitted for review."', async ({
  page,
}, testInfo) => {
  await savePolarity(page, 'Higher is better');
  await expect(taskStatus(page, 'Publishing date')).toHaveText('Complete');
  await expect(taskStatus(page, 'Update summary')).toHaveText('Complete');

  await page.getByRole('button', { name: 'Submit for review' }).click();

  await expect(page).toHaveURL(overviewPath());
  await expect(page.getByText('Update successfully submitted for review.')).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('a submitted update has the publishing status "Update pending decision" on the overview and the dashboard', async ({
  page,
}) => {
  await page.goto(overviewPath());
  await expect(statusTags(page)).toHaveText([
    'Indicator status: Live indicator',
    'Publishing status: Update pending decision',
  ]);

  await page.goto('/dashboard');
  const row = page.getByRole('table').getByRole('row').filter({ hasText: indicator.name });
  await expect(row.locator('.govuk-tag')).toHaveText(['Live', 'Update pending decision']);
});
