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

const SECTION: Section = { key: 'calculation', taskName: 'How the indicator was calculated' };
const TITLE = 'How the indicator was calculated';
const STANDARD_QUESTION = 'Was the standard calculation method used for this indicator?';
const SELECT_STANDARD = 'Select whether the described standard method was used for this indicator';
const METHODOLOGY = 'Enter methodology';
const OHID = 'Office for Health Improvement and Disparities';
const DHSC = 'Department of Health and Social Care';
const OTHER = 'Other organisation or organisations';
const DETAILS = 'Enter details of the other organisation or organisations';
const NO_VALUE_TYPE =
  'You need to select the value type for this indicator before you can complete this page.';
const LIFE_EXPECTANCY_METHOD =
  'Calculated using a standard abridged life table approach. This is based on deaths and population broken down by age.';

test.use({ storageState: PUBLISHER.storageState });

/**
 * Opens the page of a new draft whose value type is the one named, chosen on its own page first.
 * Life expectancy and Score ask nothing more about counts and values. Answers the page's path
 * and the draft's task list path.
 */
async function openWithValueType(page: Page, valueType: 'Life expectancy' | 'Score') {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;

  await page.goto(pagePath.replace(/calculation$/, 'value-type-and-units'));
  await page.getByLabel('What is the value type?', { exact: true }).selectOption({
    label: valueType,
  });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);

  await page.goto(pagePath);
  return { pagePath, taskListPath };
}

function standardQuestion(page: Page) {
  return page.getByRole('group', { name: STANDARD_QUESTION });
}

async function submitOtherWithoutDetails(page: Page) {
  await page.getByLabel(OTHER, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
}

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(answerTo(page, 'Value type')).toHaveText('Not selected yet');
    await expect(answerTo(page, 'Standard calculation method')).toHaveText(
      'Not possible to include yet',
    );
    await expect(page.getByText(NO_VALUE_TYPE)).toBeVisible();
    for (const option of [OHID, DHSC, OTHER]) {
      await expect(page.getByLabel(option, { exact: true })).not.toBeChecked();
    }
  },
  refusal: {
    messages: ['Select who calculated the indicator'],
    focuses: (page) => page.getByLabel(OHID, { exact: true }),
  },
});

test('saves who calculated the indicator before a value type is chosen, leaving the task incomplete', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await page.getByLabel(DHSC, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Incomplete');
  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(page.getByLabel(DHSC, { exact: true })).toBeChecked();
});

test('shows the standard method of the value type and asks whether it was used', async ({
  page,
}) => {
  await openWithValueType(page, 'Life expectancy');

  await expect(answerTo(page, 'Value type')).toHaveText('Life expectancy');
  await expect(answerTo(page, 'Standard calculation method')).toHaveText(LIFE_EXPECTANCY_METHOD);
  await expect(page.getByText(NO_VALUE_TYPE)).toBeHidden();

  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([
    SELECT_STANDARD,
    'Select who calculated the indicator',
  ]);
  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: SELECT_STANDARD }).click();
  await expect(standardQuestion(page).getByLabel('Yes')).toBeFocused();
});

test('reveals the methodology only while No is chosen', async ({ page }) => {
  await openWithValueType(page, 'Life expectancy');

  await expect(page.getByLabel(METHODOLOGY, { exact: true })).toBeHidden();
  await standardQuestion(page).getByLabel('No').check();
  await expect(page.getByLabel(METHODOLOGY, { exact: true })).toBeVisible();
  await standardQuestion(page).getByLabel('Yes').check();
  await expect(page.getByLabel(METHODOLOGY, { exact: true })).toBeHidden();
});

test('asks for the methodology under No, then saves every answer and shows the task as completed', async ({
  page,
}) => {
  const { taskListPath } = await openWithValueType(page, 'Life expectancy');

  await standardQuestion(page).getByLabel('No').check();
  await page.getByLabel(OHID, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert').getByRole('link')).toHaveText(['Enter the methodology']);

  await page.getByLabel(METHODOLOGY, { exact: true }).fill('  Abridged life table to age 90.  ');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(standardQuestion(page).getByLabel('No')).toBeChecked();
  await expect(page.getByLabel(METHODOLOGY, { exact: true })).toHaveValue(
    'Abridged life table to age 90.',
  );
});

test('forgets the methodology once the standard method is used, and the preview shows the standard method', async ({
  page,
}) => {
  const { pagePath, taskListPath } = await openWithValueType(page, 'Life expectancy');
  await standardQuestion(page).getByLabel('No').check();
  await page.getByLabel(METHODOLOGY, { exact: true }).fill('Abridged life table to age 90.');
  await page.getByLabel(OHID, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);

  await page.goto(pagePath);
  await standardQuestion(page).getByLabel('Yes').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await standardQuestion(page).getByLabel('No').check();
  await expect(page.getByLabel(METHODOLOGY, { exact: true })).toBeEmpty();

  const previewPath = taskListPath.replace(
    /^\/publish\/indicators\/([0-9a-f-]{36})\/task-list$/,
    '/dashboard/indicators/$1/preview',
  );
  await openIndicatorPage(page, previewPath);
  await page.getByRole('tab', { name: 'About this indicator', exact: true }).click();
  await expect(answerTo(page, 'How the indicator was calculated')).toHaveText(
    LIFE_EXPECTANCY_METHOD,
  );
});

test('asks for the methodology alone for a value type with no standard method', async ({
  page,
}) => {
  const { taskListPath } = await openWithValueType(page, 'Score');

  await expect(answerTo(page, 'Standard calculation method')).toHaveText(
    'No standard method available',
  );
  await expect(standardQuestion(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: METHODOLOGY })).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Enter the methodology',
    'Select who calculated the indicator',
  ]);

  await page.getByLabel(METHODOLOGY, { exact: true }).fill('A weighted score of five measures.');
  await page.getByLabel(DHSC, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
});

test('reveals the other organisations only while "Other" is chosen', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await expect(page.getByLabel(DETAILS, { exact: true })).toBeHidden();

  await page.getByLabel(OTHER, { exact: true }).check();
  await expect(page.getByLabel(DETAILS, { exact: true })).toBeVisible();

  await page.getByLabel(DHSC, { exact: true }).check();
  await expect(page.getByLabel(DETAILS, { exact: true })).toBeHidden();
});

test('asks for the organisation name when "Other" is chosen without one', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await submitOtherWithoutDetails(page);

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Enter the organisation name']);
  await expect(page.getByLabel(OTHER, { exact: true })).toBeChecked();

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: 'Enter the organisation name' }).click();
  await expect(page.getByLabel(DETAILS, { exact: true })).toBeFocused();
});

test('forgets the other organisations once OHID or DHSC is chosen instead', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await page.getByLabel(OTHER, { exact: true }).check();
  await page.getByLabel(DETAILS, { exact: true }).fill('Office for National Statistics');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.goto(pagePath);
  await expect(page.getByLabel(DETAILS, { exact: true })).toHaveValue(
    'Office for National Statistics',
  );
  await page.getByLabel(OHID, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.goto(pagePath);
  await expect(page.getByLabel(OHID, { exact: true })).toBeChecked();
  await page.getByLabel(OTHER, { exact: true }).check();
  await expect(page.getByLabel(DETAILS, { exact: true })).toBeEmpty();
});

test('has no WCAG 2.2 AA violations before a value type is chosen', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the standard method answers are refused', async ({
  page,
}, testInfo) => {
  await openWithValueType(page, 'Life expectancy');
  await standardQuestion(page).getByLabel('No').check();
  await submitOtherWithoutDetails(page);
  await expect(page.getByRole('alert')).toContainText('Enter the methodology');

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the revealed fields and saves the answers', async ({ page }) => {
    const { taskListPath } = await openWithValueType(page, 'Life expectancy');

    await expect(page.getByLabel(METHODOLOGY, { exact: true })).toBeVisible();
    await expect(page.getByLabel(DETAILS, { exact: true })).toBeVisible();

    await standardQuestion(page).getByLabel('No').check();
    await page.getByLabel(METHODOLOGY, { exact: true }).fill('Abridged life table to age 90.');
    await page.getByLabel(OTHER, { exact: true }).check();
    await page.getByLabel(DETAILS, { exact: true }).fill('Office for National Statistics');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  });
});
