import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import { openIndicatorPage } from '../support/indicator-page.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';
import { answerTo } from '../support/summary-list.ts';

const SECTION: Section = { key: 'period-type', taskName: 'Time periods' };
const TITLE = 'Time periods';

type TimePeriod =
  | 'Periods of more than 1 year'
  | 'Single years'
  | 'Quarters'
  | 'Months'
  | 'Specific date range';

function timePeriod(page: Page, label: TimePeriod) {
  return page
    .getByRole('group', { name: 'Select all time periods used in this indicator' })
    .getByLabel(label, { exact: true });
}

// Periods of more than 1 year and single years each reveal a year type question of their own.
function yearTypes(page: Page, under: 'Periods of more than 1 year' | 'Single years') {
  const reveal = page.locator(
    `#conditional-timePeriods-checkbox-${under === 'Single years' ? 1 : 0}`,
  );
  return reveal.getByRole('group', { name: 'Select year type' });
}

function dateGroup(page: Page, name: 'Start date' | 'End date') {
  return page.getByRole('group', { name, exact: true });
}

function yesNo(page: Page, question: string, answer: 'Yes' | 'No') {
  return page.getByRole('group', { name: question }).getByLabel(answer, { exact: true });
}

const ROLLING = 'Are time periods rolling?';
const CUMULATIVE = 'Are values cumulative across time periods?';

function continueButton(page: Page) {
  return page.getByRole('button', { name: 'Continue' });
}

async function answerRollingAndCumulative(page: Page) {
  await yesNo(page, ROLLING, 'No').check();
  await yesNo(page, CUMULATIVE, 'No').check();
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByRole('main').getByRole('checkbox', { checked: true })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('radio', { checked: true })).toHaveCount(0);
    for (const label of [
      'Periods of more than 1 year',
      'Single years',
      'Quarters',
      'Months',
      'Specific date range',
    ] as const) {
      await expect(timePeriod(page, label)).toBeVisible();
    }
  },
  refusal: {
    messages: [
      'Select the time periods included in this indicator',
      'Select whether time periods are rolling',
      'Select whether values are cumulative across time periods',
    ],
    focuses: (page) => timePeriod(page, 'Periods of more than 1 year'),
  },
});

test('reveals the questions each kind of time period asks only while it is ticked', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);

  await expect(page.getByRole('group', { name: 'Select year type' })).toHaveCount(0);
  await expect(page.getByLabel('Enter number of years')).toBeHidden();

  await timePeriod(page, 'Periods of more than 1 year').check();
  await expect(page.getByLabel('Enter number of years')).toBeVisible();
  await expect(yearTypes(page, 'Periods of more than 1 year')).toBeVisible();
  await expect(yearTypes(page, 'Single years')).toBeHidden();

  await timePeriod(page, 'Single years').check();
  await expect(yearTypes(page, 'Single years')).toBeVisible();
  await expect(
    yearTypes(page, 'Single years').getByLabel('Financial (1 April to 31 March)'),
  ).toBeVisible();

  await timePeriod(page, 'Specific date range').check();
  await expect(dateGroup(page, 'Start date')).toBeVisible();
  await expect(dateGroup(page, 'End date')).toBeVisible();
  // A date range recurs every year, so only the day and month are asked for.
  await expect(dateGroup(page, 'Start date').getByLabel('Year', { exact: true })).toHaveCount(0);

  await expect(page.getByRole('group', { name: 'Select rolling frequency' })).toBeHidden();
  await yesNo(page, ROLLING, 'Yes').check();
  await expect(page.getByRole('group', { name: 'Select rolling frequency' })).toBeVisible();
});

test('asks for the number of years and year type of periods of more than 1 year', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);

  await timePeriod(page, 'Periods of more than 1 year').check();
  await page.getByLabel('Enter number of years').fill('1');
  await answerRollingAndCumulative(page);
  await continueButton(page).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([
    'Number of years must be 2 or more',
    'Select the year type',
  ]);
  await expect(timePeriod(page, 'Periods of more than 1 year')).toBeChecked();

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: 'Select the year type' }).click();
  await expect(
    yearTypes(page, 'Periods of more than 1 year').getByLabel(
      'Calendar (1 January to 31 December)',
    ),
  ).toBeFocused();
});

test('refuses a date range end that is not a real date', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await timePeriod(page, 'Specific date range').check();
  await dateGroup(page, 'Start date').getByLabel('Day').fill('1');
  await dateGroup(page, 'Start date').getByLabel('Month').fill('9');
  await dateGroup(page, 'End date').getByLabel('Day').fill('30');
  await dateGroup(page, 'End date').getByLabel('Month').fill('2');
  await answerRollingAndCumulative(page);
  await continueButton(page).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Date must be a real date']);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(dateGroup(page, 'End date').getByLabel('Day')).toBeFocused();
});

test('saves every kind of time period and shows them in the preview', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;

  await timePeriod(page, 'Periods of more than 1 year').check();
  await page.getByLabel('Enter number of years').fill('3');
  await yearTypes(page, 'Periods of more than 1 year')
    .getByLabel('Calendar (1 January to 31 December)')
    .check();
  await timePeriod(page, 'Single years').check();
  await yearTypes(page, 'Single years').getByLabel('Ending a specified date').check();
  await yearTypes(page, 'Single years').getByLabel('Day').fill('31');
  await yearTypes(page, 'Single years').getByLabel('Month').fill('07');
  await timePeriod(page, 'Quarters').check();
  await timePeriod(page, 'Specific date range').check();
  await dateGroup(page, 'Start date').getByLabel('Day').fill('1');
  await dateGroup(page, 'Start date').getByLabel('Month').fill('10');
  await dateGroup(page, 'End date').getByLabel('Day').fill('31');
  await dateGroup(page, 'End date').getByLabel('Month').fill('3');
  await yesNo(page, ROLLING, 'Yes').check();
  await page
    .getByRole('group', { name: 'Select rolling frequency' })
    .getByLabel('Months', { exact: true })
    .check();
  await yesNo(page, CUMULATIVE, 'Yes').check();
  await continueButton(page).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(timePeriod(page, 'Quarters')).toBeChecked();
  await expect(timePeriod(page, 'Months')).not.toBeChecked();
  await expect(page.getByLabel('Enter number of years')).toHaveValue('3');
  await expect(yearTypes(page, 'Single years').getByLabel('Day')).toHaveValue('31');
  await expect(yearTypes(page, 'Single years').getByLabel('Month')).toHaveValue('7');

  await openIndicatorPage(
    page,
    taskListPath.replace(
      /^\/publish\/indicators\/([0-9a-f-]{36})\/task-list$/,
      '/dashboard/indicators/$1/preview',
    ),
  );
  await page.getByRole('tab', { name: 'About this indicator', exact: true }).click();
  await expect(answerTo(page, 'Time periods')).toHaveText(
    '3-year Calendar years (1 January to 31 December), Years ending 31 July, Quarters, 1 October to 31 March',
  );
  await expect(answerTo(page, 'Rolling time periods')).toHaveText('Yes - Months');
  await expect(answerTo(page, 'Cumulative values')).toHaveText('Yes');
});

test('forgets the answers of a kind of time period once it is unticked', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await timePeriod(page, 'Single years').check();
  await yearTypes(page, 'Single years').getByLabel('Financial (1 April to 31 March)').check();
  await answerRollingAndCumulative(page);
  await continueButton(page).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await timePeriod(page, 'Single years').uncheck();
  await timePeriod(page, 'Months').check();
  await continueButton(page).click();
  await expect(page).toHaveURL(taskListPath);

  await page.goto(pagePath);
  await expect(timePeriod(page, 'Months')).toBeChecked();
  await timePeriod(page, 'Single years').check();
  await expect(yearTypes(page, 'Single years').getByRole('radio', { checked: true })).toHaveCount(
    0,
  );
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await timePeriod(page, 'Periods of more than 1 year').check();
  await timePeriod(page, 'Specific date range').check();

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the answers are refused', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await timePeriod(page, 'Single years').check();
  await yearTypes(page, 'Single years').getByLabel('Ending a specified date').check();
  await yearTypes(page, 'Single years').getByLabel('Day').fill('31');
  await yearTypes(page, 'Single years').getByLabel('Month').fill('4');
  await continueButton(page).click();
  await expect(page.getByRole('alert')).toContainText('Date must be a real date');

  await expectNoAccessibilityViolations(page, testInfo);
});
