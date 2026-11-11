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

const SECTION: Section = { key: 'sex-and-ages', taskName: 'Sex, gender and ethnicity' };
const TITLE = 'Sex, gender and ethnicity';

const COLLECTED = 'What was collected for this indicator?';
const SEXES = 'Select included sexes';
const GENDERS = 'Select included genders';
const ETHNIC_GROUPS = 'Select included ethnic groups';

function label(page: Page, text: string) {
  return page.getByLabel(text, { exact: true });
}

// "Person" and "Other" are offered by more than one group, so each box is found in its own.
function box(page: Page, group: string, text: string) {
  return page.getByRole('group', { name: group, exact: true }).getByLabel(text, { exact: true });
}

function collected(page: Page, text: 'Sex' | 'Gender' | 'Ethnicity') {
  return box(page, COLLECTED, text);
}

/** Ticks Sex as collected and the sexes given. */
async function tickSexes(page: Page, ...sexes: string[]) {
  await collected(page, 'Sex').check();
  for (const sex of sexes) await box(page, SEXES, sex).check();
}

/** Fills one limit: its number, and the period chosen beside it. */
async function fillLimit(page: Page, limit: string, value: string, period: string) {
  await label(page, limit).fill(value);
  await label(page, `Periods for ${limit.toLowerCase()}`).selectOption(period);
}

// The Other field shares its label with the Other age type.
function ageType(page: Page, name: string) {
  return page.getByRole('radio', { name, exact: true });
}

function otherField(page: Page) {
  return page.getByRole('textbox', { name: 'Other', exact: true });
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    for (const name of ['Sex', 'Gender', 'Ethnicity'] as const) {
      await expect(collected(page, name)).not.toBeChecked();
    }
    for (const name of ['All ages', 'Age range', 'Specific age', 'Other']) {
      await expect(ageType(page, name)).not.toBeChecked();
    }
  },
  refusal: {
    messages: ['Select what was collected for this indicator', 'Select the age type'],
    focuses: (page) => collected(page, 'Sex'),
  },
});

test('reveals the list of each demographic only while it is ticked', async ({ page }) => {
  await openSectionPage(page, SECTION);

  for (const group of [SEXES, GENDERS, ETHNIC_GROUPS]) {
    await expect(page.getByRole('group', { name: group, exact: true })).toBeHidden();
  }

  await collected(page, 'Sex').check();
  await collected(page, 'Ethnicity').check();
  await expect(box(page, SEXES, 'Person')).toBeVisible();
  await expect(page.getByRole('group', { name: GENDERS, exact: true })).toBeHidden();
  await expect(box(page, ETHNIC_GROUPS, 'Other ethnic group')).toBeVisible();

  await collected(page, 'Sex').uncheck();
  await collected(page, 'Gender').check();
  await expect(page.getByRole('group', { name: SEXES, exact: true })).toBeHidden();
  await expect(box(page, GENDERS, 'Prefer not to say')).toBeVisible();
});

test('asks for the list of each demographic collected', async ({ page }) => {
  await openSectionPage(page, SECTION);
  for (const name of ['Sex', 'Gender', 'Ethnicity'] as const) await collected(page, name).check();
  await ageType(page, 'All ages').check();

  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([
    'Select the sexes included',
    'Select the genders included',
    'Select the ethnic groups included',
  ]);
  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: 'Select the genders included' }).click();
  await expect(box(page, GENDERS, 'Person')).toBeFocused();
});

test('saves gender and ethnicity, forgetting the sexes once sex is unticked', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await tickSexes(page, 'Female');
  await collected(page, 'Gender').check();
  await box(page, GENDERS, 'Woman or girl').check();
  await box(page, GENDERS, 'Non-binary').check();
  await ageType(page, 'All ages').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);

  await page.goto(pagePath);
  await collected(page, 'Sex').uncheck();
  await collected(page, 'Ethnicity').check();
  await box(page, ETHNIC_GROUPS, 'White').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(collected(page, 'Sex')).not.toBeChecked();
  await expect(collected(page, 'Gender')).toBeChecked();
  await expect(collected(page, 'Ethnicity')).toBeChecked();
  await expect(box(page, GENDERS, 'Woman or girl')).toBeChecked();
  await expect(box(page, GENDERS, 'Non-binary')).toBeChecked();
  await expect(box(page, ETHNIC_GROUPS, 'White')).toBeChecked();
  await collected(page, 'Sex').check();
  await expect(box(page, SEXES, 'Female')).not.toBeChecked();
});

test('reveals the fields of each age type only while it is chosen', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await expect(label(page, 'Lower limit')).toBeHidden();
  await expect(label(page, 'Age')).toBeHidden();
  await expect(otherField(page)).toBeHidden();

  await ageType(page, 'Age range').check();
  await expect(label(page, 'Lower limit')).toBeVisible();
  await expect(label(page, 'Upper limit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add another range' })).toBeVisible();

  await ageType(page, 'Specific age').check();
  await expect(label(page, 'Lower limit')).toBeHidden();
  await expect(label(page, 'Age')).toBeVisible();

  await ageType(page, 'Other').check();
  await expect(label(page, 'Age')).toBeHidden();
  await expect(otherField(page)).toBeVisible();
});

test('lines up each limit with the period beside it', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await ageType(page, 'Age range').check();

  for (const limit of ['Lower limit', 'Upper limit']) {
    await expect(label(page, limit)).toBeVisible();
    const value = await label(page, limit).boundingBox();
    const period = await label(page, `Periods for ${limit.toLowerCase()}`).boundingBox();
    if (!value || !period) throw new Error(`${limit} and its period must be visible`);
    expect(period.y + period.height, limit).toBeCloseTo(value.y + value.height, 0);
  }
});

test('adds and removes age ranges, keeping what was typed', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await ageType(page, 'Age range').check();
  await fillLimit(page, 'Lower limit', '16', 'years');

  await page.getByRole('button', { name: 'Add another range' }).click();
  await page.getByRole('button', { name: 'Add another range' }).click();

  await expect(label(page, 'Lower limit')).toHaveValue('16');
  await expect(label(page, 'Lower limit 3')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove range/ })).toHaveText([
    'Remove range 2',
    'Remove range 3',
  ]);

  await fillLimit(page, 'Upper limit 3', '4', 'months');
  await page.getByRole('button', { name: 'Remove range 2' }).click();

  await expect(label(page, 'Upper limit 2')).toHaveValue('4');
  await expect(label(page, 'Periods for upper limit 2')).toHaveValue('months');
  await expect(label(page, 'Lower limit 3')).toHaveCount(0);
});

test('shows each range after a removed one with its own values', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await ageType(page, 'Age range').check();
  await fillLimit(page, 'Lower limit', '1', 'days');
  await page.getByRole('button', { name: 'Add another range' }).click();
  await fillLimit(page, 'Lower limit 2', '2', 'weeks');
  await fillLimit(page, 'Upper limit 2', '20', 'weeks');
  await page.getByRole('button', { name: 'Add another range' }).click();
  await fillLimit(page, 'Lower limit 3', '3', 'years');
  await fillLimit(page, 'Upper limit 3', '30', 'years');

  await page.getByRole('button', { name: 'Remove range 2' }).click();

  await expect(label(page, 'Lower limit')).toHaveValue('1');
  await expect(label(page, 'Lower limit 2')).toHaveValue('3');
  await expect(label(page, 'Periods for lower limit 2')).toHaveValue('years');
  await expect(label(page, 'Upper limit 2')).toHaveValue('30');
  await expect(label(page, 'Periods for upper limit 2')).toHaveValue('years');
  await expect(label(page, 'Lower limit 3')).toHaveCount(0);
});

test('refuses each range on the field at fault, naming the range from the second on', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);
  await tickSexes(page, 'Person');
  await ageType(page, 'Age range').check();
  await label(page, 'Lower limit').fill('16');
  await page.getByRole('button', { name: 'Add another range' }).click();
  await page.getByRole('button', { name: 'Add another range' }).click();
  await fillLimit(page, 'Lower limit 3', '5', 'years');
  await fillLimit(page, 'Upper limit 3', '4', 'years');

  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([
    'Select the periods for the lower limit',
    'You must enter at least a lower or upper limit for range 2',
    'Upper limit 3 must not be lower than lower limit 3',
  ]);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: /range 2$/ }).click();
  await expect(label(page, 'Lower limit 2')).toBeFocused();
});

test('asks for the specific age and its period, and for other ages', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await tickSexes(page, 'Male');
  await ageType(page, 'Specific age').check();
  await label(page, 'Periods for age').selectOption('weeks');

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert').getByRole('link')).toHaveText(['Enter the age']);

  await ageType(page, 'Other').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert').getByRole('link')).toHaveText(['Enter the ages included']);
});

test('continues when Enter is pressed in a field, rather than adding or removing a range', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, SECTION);
  await tickSexes(page, 'Female');
  await ageType(page, 'Age range').check();
  await fillLimit(page, 'Lower limit', '16', 'years');
  await page.getByRole('button', { name: 'Add another range' }).click();
  await fillLimit(page, 'Upper limit 2', '4', 'years');

  await label(page, 'Upper limit 2').press('Enter');

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
});

test('saves nothing until Continue is selected', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await ageType(page, 'Age range').check();
  await fillLimit(page, 'Lower limit', '16', 'years');
  await page.getByRole('button', { name: 'Add another range' }).click();

  await page.goto(pagePath);

  await expect(ageType(page, 'Age range')).not.toBeChecked();
  await expect(label(page, 'Lower limit 2')).toHaveCount(0);
});

test('saves the sexes and ages on Continue and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await tickSexes(page, 'Female', 'Male');
  await ageType(page, 'Age range').check();
  await fillLimit(page, 'Upper limit', '11', 'months');
  await page.getByRole('button', { name: 'Add another range' }).click();
  await fillLimit(page, 'Lower limit 2', '1', 'years');
  await fillLimit(page, 'Upper limit 2', '4', 'years');

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(collected(page, 'Sex')).toBeChecked();
  await expect(box(page, SEXES, 'Person')).not.toBeChecked();
  await expect(box(page, SEXES, 'Female')).toBeChecked();
  await expect(box(page, SEXES, 'Male')).toBeChecked();
  await expect(ageType(page, 'Age range')).toBeChecked();
  await expect(label(page, 'Lower limit')).toHaveValue('');
  await expect(label(page, 'Upper limit')).toHaveValue('11');
  await expect(label(page, 'Periods for upper limit')).toHaveValue('months');
  await expect(label(page, 'Lower limit 2')).toHaveValue('1');
  await expect(label(page, 'Upper limit 2')).toHaveValue('4');
});

test('saves all ages alone and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await tickSexes(page, 'Person');
  await ageType(page, 'All ages').check();

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  await page.goto(pagePath);
  await expect(ageType(page, 'All ages')).toBeChecked();
});

test('saves another age type and forgets the ranges saved before', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await tickSexes(page, 'Person');
  await ageType(page, 'Age range').check();
  await fillLimit(page, 'Lower limit', '65', 'years');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);

  await page.goto(pagePath);
  await ageType(page, 'Other').check();
  await otherField(page).fill('School year 6');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(ageType(page, 'Other')).toBeChecked();
  await expect(otherField(page)).toHaveValue('School year 6');
  await ageType(page, 'Age range').check();
  await expect(label(page, 'Lower limit')).toHaveValue('');
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations with every list revealed and refused', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, SECTION);
  for (const name of ['Sex', 'Gender', 'Ethnicity'] as const) await collected(page, name).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Select the ethnic groups included');

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations with ranges added and refused', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await ageType(page, 'Age range').check();
  await page.getByRole('button', { name: 'Add another range' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('for range 2');

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('adds and removes age ranges, then saves them', async ({ page }) => {
    const taskListPath = await openSectionPage(page, SECTION);

    await expect(label(page, 'Lower limit')).toBeVisible();

    await collected(page, 'Sex').check();
    await box(page, SEXES, 'Person').check();
    await fillLimit(page, 'Lower limit', '16', 'years');
    await page.getByRole('button', { name: 'Add another range' }).click();
    await expect(ageType(page, 'Age range')).toBeChecked();
    await page.getByRole('button', { name: 'Add another range' }).click();
    await page.getByRole('button', { name: 'Remove range 3' }).click();
    await fillLimit(page, 'Upper limit 2', '4', 'years');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  });

  test('shows every list, and saves only those of the demographics ticked', async ({ page }) => {
    const taskListPath = await openSectionPage(page, SECTION);
    const pagePath = new URL(page.url()).pathname;

    for (const group of [SEXES, GENDERS, ETHNIC_GROUPS]) {
      await expect(page.getByRole('group', { name: group, exact: true })).toBeVisible();
    }

    // A list ticked under a demographic left unticked is neither refused nor saved.
    await collected(page, 'Ethnicity').check();
    await box(page, ETHNIC_GROUPS, 'Mixed or Multiple ethnic groups').check();
    await box(page, SEXES, 'Male').check();
    await ageType(page, 'All ages').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
    await page.goto(pagePath);
    await expect(box(page, ETHNIC_GROUPS, 'Mixed or Multiple ethnic groups')).toBeChecked();
    await expect(box(page, SEXES, 'Male')).not.toBeChecked();
  });
});
