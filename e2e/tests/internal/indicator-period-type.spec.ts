import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const SECTION: Section = { key: 'period-type', taskName: 'Period type' };
const TITLE = 'What is the period type in this indicator?';

type PeriodType = 'Years' | 'Quarters' | 'Months';

function periodType(page: Page, label: PeriodType) {
  return page.getByRole('group', { name: 'Select period type' }).getByLabel(label, { exact: true });
}

// Years and Quarters each reveal their own year type question; the reveal is named by position.
function yearTypes(page: Page, under: 'Years' | 'Quarters') {
  const reveal = page.locator(`#conditional-periodType-radio-${under === 'Years' ? 0 : 1}`);
  return reveal.getByRole('group', { name: 'Select year type' });
}

function yearType(page: Page, under: 'Years' | 'Quarters', label: string) {
  return yearTypes(page, under).getByLabel(label, { exact: true });
}

function datePart(page: Page, under: 'Years' | 'Quarters', part: 'Day' | 'Month') {
  return yearTypes(page, under).getByLabel(part, { exact: true });
}

async function endingOn(page: Page, under: 'Years' | 'Quarters', day: string, month: string) {
  await periodType(page, under).check();
  await yearType(page, under, 'Ending a specified date').check();
  await datePart(page, under, 'Day').fill(day);
  await datePart(page, under, 'Month').fill(month);
}

function continueButton(page: Page) {
  return page.getByRole('button', { name: 'Continue' });
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByRole('main').getByRole('radio', { checked: true })).toHaveCount(0);
    for (const label of ['Years', 'Quarters', 'Months'] as const) {
      await expect(periodType(page, label)).toBeVisible();
    }
  },
  refusal: {
    messages: ['Select the period type'],
    focuses: (page) => periodType(page, 'Years'),
  },
});

test('asks years and quarters for the year type, and months for nothing more', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await expect(yearTypes(page, 'Years')).toBeHidden();

  await periodType(page, 'Years').check();
  await expect(yearTypes(page, 'Years')).toBeVisible();
  await expect(yearTypes(page, 'Quarters')).toBeHidden();

  await periodType(page, 'Quarters').check();
  await expect(yearTypes(page, 'Quarters')).toBeVisible();
  await expect(yearTypes(page, 'Years')).toBeHidden();

  await periodType(page, 'Months').check();
  await expect(page.getByRole('group', { name: 'Select year type' })).toHaveCount(0);
});

test('asks for the date only of a year ending on a specified date', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await periodType(page, 'Years').check();

  await yearType(page, 'Years', 'Calendar').check();
  await expect(datePart(page, 'Years', 'Day')).toBeHidden();

  await yearType(page, 'Years', 'Ending a specified date').check();
  await expect(datePart(page, 'Years', 'Day')).toBeVisible();
  await expect(datePart(page, 'Years', 'Month')).toBeVisible();

  // The year moves on with each period, so only the day and month are asked for, and the
  // component's offer of an example of the format is declined.
  await expect(yearTypes(page, 'Years').getByLabel('Year', { exact: true })).toHaveCount(0);
  await expect(yearTypes(page, 'Years').locator('.govuk-hint')).toHaveCount(0);
});

test('asks for the year type of years', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await periodType(page, 'Years').check();
  await continueButton(page).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Select the year type']);
  await expect(periodType(page, 'Years')).toBeChecked();

  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(yearType(page, 'Years', 'Calendar')).toBeFocused();
});

test('asks for the date a year ends on', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await endingOn(page, 'Quarters', '', '');
  await continueButton(page).click();

  await expect(page.getByRole('alert').getByRole('link')).toHaveText(['Enter the date']);
  await expect(yearType(page, 'Quarters', 'Ending a specified date')).toBeChecked();
});

test('refuses a date that is not real, such as 31 February', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await endingOn(page, 'Years', '31', '2');
  await continueButton(page).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Date must be a real date']);
  await expect(datePart(page, 'Years', 'Day')).toHaveValue('31');
  await expect(datePart(page, 'Years', 'Month')).toHaveValue('2');

  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(datePart(page, 'Years', 'Day')).toBeFocused();
});

test('saves nothing until every answer is given', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;

  await endingOn(page, 'Years', '31', '');
  await continueButton(page).click();
  await expect(page.getByRole('alert')).toContainText('Date must include a month');

  await page.goto(pagePath);
  await expect(page.getByRole('main').getByRole('radio', { checked: true })).toHaveCount(0);
});

test('saves years ending on a specified date and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await endingOn(page, 'Years', '31', '07');
  await continueButton(page).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(periodType(page, 'Years')).toBeChecked();
  await expect(yearType(page, 'Years', 'Ending a specified date')).toBeChecked();
  await expect(datePart(page, 'Years', 'Day')).toHaveValue('31');
  await expect(datePart(page, 'Years', 'Month')).toHaveValue('7');
});

test('saves months and forgets the year type once months are chosen', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await periodType(page, 'Quarters').check();
  await yearType(page, 'Quarters', 'Financial').check();
  await continueButton(page).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(yearType(page, 'Quarters', 'Financial')).toBeChecked();
  await periodType(page, 'Months').check();
  await continueButton(page).click();
  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(periodType(page, 'Months')).toBeChecked();
  await periodType(page, 'Quarters').check();
  await expect(yearTypes(page, 'Quarters').getByRole('radio', { checked: true })).toHaveCount(0);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the date is refused', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await endingOn(page, 'Years', '31', '4');
  await continueButton(page).click();
  await expect(page.getByRole('alert')).toContainText('Date must be a real date');

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('asks the year type under both years and quarters, and saves the chosen one', async ({
    page,
  }) => {
    const taskListPath = await openSectionPage(page, SECTION);
    const pagePath = new URL(page.url()).pathname;

    await expect(yearTypes(page, 'Years')).toBeVisible();
    await expect(yearTypes(page, 'Quarters')).toBeVisible();

    await yearType(page, 'Years', 'Calendar').check();
    await endingOn(page, 'Quarters', '30', '9');
    await continueButton(page).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

    await page.goto(pagePath);
    await expect(periodType(page, 'Quarters')).toBeChecked();
    await expect(yearType(page, 'Quarters', 'Ending a specified date')).toBeChecked();
    await expect(datePart(page, 'Quarters', 'Day')).toHaveValue('30');
    await expect(yearTypes(page, 'Years').getByRole('radio', { checked: true })).toHaveCount(0);
  });
});

test('validates, saves and clears the optional date from which data is shown', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await periodType(page, 'Months').check();
  const start = page.getByRole('textbox', { name: 'Show data from (optional)' });
  await start.fill('2023-02-29');
  await continueButton(page).click();
  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText('Enter a real date in the format YYYY-MM-DD');
  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(start).toBeFocused();
  await start.fill('2020-01-01');
  await continueButton(page).click();
  await expect(page).toHaveURL(taskListPath);
  await page.goto(pagePath);
  await expect(start).toHaveValue('2020-01-01');
  await start.fill('');
  await continueButton(page).click();
  await expect(page).toHaveURL(taskListPath);
  await page.goto(pagePath);
  await expect(start).toBeEmpty();
});
