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
import { answerTo } from '../support/summary-list.ts';

const SECTION: Section = { key: 'value-type-and-units', taskName: 'Value types, counts and units' };
const TITLE = 'Value types, counts and units';
const VALUE_TYPE = 'What is the value type?';
const STANDARD_POPULATION = 'What standard population has been used?';
const POPULATION = 'Enter the standard or reference used for the standardisation calculation';
const HAS_COUNT = 'Is there a count?';
const COUNT_MEASURE = 'What is the count measuring?';
const COUNT_MEASURE_OTHER = 'Enter what the count is measuring';
const RATE_PER = 'What number is the rate per?';
const RATE_OBJECT = 'What object is the rate per?';
const RATE_OBJECT_OTHER = 'Enter what the rate or proportion is per';
const SAME_AS_COUNT = 'Is the value measuring the same thing as the count?';
const VALUE_MEASURE = 'What is the value measuring?';
const GAP_OBJECT = 'What object is the gap the difference of?';
const RATIO_FORMAT = 'Is the value a number or a percentage?';
const PREVIEW = 'Preview of counts and values';

/** The page once hydrated, which hides the follow-ups while nothing is chosen. */
async function openHydratedPage(page: Page): Promise<string> {
  const taskListPath = await openSectionPage(page, SECTION);
  await expect(page.getByLabel(COUNT_MEASURE)).toBeHidden();

  return taskListPath;
}

async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).selectOption({ label: option });
}

function question(page: Page, legend: string) {
  return page.getByRole('group', { name: legend });
}

function standardPopulationOther(page: Page) {
  return question(page, STANDARD_POPULATION).getByLabel(POPULATION);
}

// The reference population of an indirectly standardised value type.
function referencePopulation(page: Page) {
  return page.locator('#referencePopulation-input');
}

/** The preview's rows, each its key and value, or none while it is not shown. */
async function expectPreview(page: Page, counts: string, values: string) {
  await expect(page.getByRole('heading', { name: PREVIEW })).toBeVisible();
  await expect(answerTo(page, 'Counts')).toHaveText(counts);
  await expect(answerTo(page, 'Values')).toHaveText(values);
}

async function continueAndExpectErrors(page: Page, messages: string[], enhanced = true) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveTitle(/^Error: /);
  await expect(page.getByRole('alert').getByRole('link')).toHaveText(messages);
  if (enhanced) await expectErrorSummaryReady(page);
}

async function continueToTaskList(page: Page, taskListPath: string) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  await taskRow(page, SECTION.taskName).getByRole('link').click();
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByLabel(VALUE_TYPE).locator('option:checked')).toHaveText('Select');
    await expect(page.getByRole('heading', { name: PREVIEW })).toBeHidden();
  },
  refusal: {
    messages: ['Select the value type'],
    focuses: (page) => page.getByLabel(VALUE_TYPE),
  },
});

test('lists the value types alphabetically', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await expect(page.getByLabel(VALUE_TYPE).locator('option')).toHaveText([
    'Select',
    'Count',
    'Crude rate',
    'Directly standardised rate',
    'Gap',
    'Healthy life expectancy',
    'Indirectly standardised proportion',
    'Indirectly standardised rate',
    'Indirectly standardised ratio',
    'Life expectancy',
    'Mean',
    'Median',
    'Proportion',
    'Ratio',
    'Relative index of inequality',
    'Score',
    'Slope index of inequality',
  ]);
});

test('shows only the questions the chosen value type and answers ask', async ({ page }) => {
  await openHydratedPage(page);

  for (const label of [RATE_PER, VALUE_MEASURE, GAP_OBJECT]) {
    await expect(page.getByLabel(label)).toBeHidden();
  }

  await choose(page, VALUE_TYPE, 'Crude rate');
  await expect(question(page, HAS_COUNT)).toBeVisible();
  await expect(page.getByLabel(RATE_PER)).toBeVisible();
  await expect(page.getByLabel(COUNT_MEASURE)).toBeHidden();
  await question(page, HAS_COUNT).getByLabel('Yes').check();
  await expect(page.getByLabel(COUNT_MEASURE)).toBeVisible();
  await expect(page.getByLabel('Count is an estimate')).toBeVisible();

  await choose(page, VALUE_TYPE, 'Proportion');
  await expect(question(page, SAME_AS_COUNT)).toBeVisible();
  await expect(page.getByLabel(RATE_PER)).toBeHidden();
  await question(page, SAME_AS_COUNT).getByLabel('No').check();
  await expect(page.getByLabel(VALUE_MEASURE)).toBeVisible();

  await choose(page, VALUE_TYPE, 'Count');
  await expect(question(page, HAS_COUNT)).toBeHidden();
  await expect(page.getByLabel(COUNT_MEASURE)).toBeVisible();
  await choose(page, COUNT_MEASURE, 'Other');
  await expect(page.getByLabel(COUNT_MEASURE_OTHER)).toBeVisible();

  await choose(page, VALUE_TYPE, 'Gap');
  await expect(page.getByLabel(VALUE_MEASURE)).toBeVisible();
  await expect(page.getByLabel(GAP_OBJECT)).toBeVisible();
  await expect(page.getByLabel(COUNT_MEASURE)).toBeHidden();

  await choose(page, VALUE_TYPE, 'Ratio');
  await expect(question(page, RATIO_FORMAT)).toBeVisible();

  await choose(page, VALUE_TYPE, 'Indirectly standardised rate');
  await expect(referencePopulation(page)).toBeVisible();
  await expect(question(page, STANDARD_POPULATION)).toBeHidden();

  await choose(page, VALUE_TYPE, 'Directly standardised rate');
  await expect(question(page, STANDARD_POPULATION)).toBeVisible();
  await expect(referencePopulation(page)).toBeHidden();
});

test('previews the counts and values once every question is answered', async ({ page }) => {
  await openHydratedPage(page);

  await choose(page, VALUE_TYPE, 'Crude rate');
  await question(page, HAS_COUNT).getByLabel('Yes').check();
  await choose(page, COUNT_MEASURE, 'admissions');
  await choose(page, RATE_PER, '100,000');
  await expect(page.getByRole('heading', { name: PREVIEW })).toBeHidden();

  await choose(page, RATE_OBJECT, 'people');
  await expectPreview(page, '[number] admissions', '[number] admissions per 100,000 people');

  await choose(page, VALUE_TYPE, 'Mean');
  await choose(page, VALUE_MEASURE, '£');
  await expectPreview(page, '-', '£[number]');
});

test('saves nothing until the follow-ups are answered', async ({ page }) => {
  await openHydratedPage(page);
  const pagePath = new URL(page.url()).pathname;

  await choose(page, VALUE_TYPE, 'Directly standardised rate');
  await continueAndExpectErrors(page, [
    'Select the standard population used',
    'Select whether there is a count',
    'Select what number the rate or proportion is per',
    'Select what object the rate or proportion is per',
  ]);

  await question(page, STANDARD_POPULATION).getByLabel('Other').check();
  await question(page, HAS_COUNT).getByLabel('Yes').check();
  await choose(page, RATE_PER, '1,000');
  await choose(page, RATE_OBJECT, 'Other');
  await continueAndExpectErrors(page, [
    POPULATION,
    'Select what the count is measuring',
    'Enter what the rate or proportion is per',
  ]);

  await page.goto(pagePath);
  await expect(page.getByLabel(VALUE_TYPE).locator('option:checked')).toHaveText('Select');
});

test('saves a counted directly standardised rate and shows the task as completed', async ({
  page,
}) => {
  const taskListPath = await openHydratedPage(page);

  await choose(page, VALUE_TYPE, 'Directly standardised rate');
  await question(page, STANDARD_POPULATION).getByLabel('2013 European Standard Population').check();
  await question(page, HAS_COUNT).getByLabel('Yes').check();
  await choose(page, COUNT_MEASURE, 'deaths');
  await page.getByLabel('Count is an estimate').check();
  await choose(page, RATE_PER, '100,000');
  await choose(page, RATE_OBJECT, 'people');
  await continueToTaskList(page, taskListPath);

  await expect(page.getByLabel(VALUE_TYPE).locator('option:checked')).toHaveText(
    'Directly standardised rate',
  );
  await expect(
    question(page, STANDARD_POPULATION).getByLabel('2013 European Standard Population'),
  ).toBeChecked();
  await expect(question(page, HAS_COUNT).getByLabel('Yes')).toBeChecked();
  await expect(page.getByLabel(COUNT_MEASURE).locator('option:checked')).toHaveText('deaths');
  await expect(page.getByLabel('Count is an estimate')).toBeChecked();
  await expectPreview(page, '[number] deaths', '[number] deaths per 100,000 people');
});

test('saves an other standard population and other answers by name', async ({ page }) => {
  const taskListPath = await openHydratedPage(page);

  await choose(page, VALUE_TYPE, 'Directly standardised rate');
  await question(page, STANDARD_POPULATION).getByLabel('Other').check();
  await standardPopulationOther(page).fill('  England 2021 mid-year estimates  ');
  await question(page, HAS_COUNT).getByLabel('No').check();
  await choose(page, RATE_PER, '1,000');
  await choose(page, RATE_OBJECT, 'Other');
  await page.getByLabel(RATE_OBJECT_OTHER).fill('live births');
  await continueToTaskList(page, taskListPath);

  await expect(standardPopulationOther(page)).toHaveValue('England 2021 mid-year estimates');
  await expect(page.getByLabel(RATE_OBJECT_OTHER)).toHaveValue('live births');
  await expectPreview(page, '-', '[number] per 1,000 live births');
});

test('saves an indirectly standardised rate with its reference population', async ({ page }) => {
  const taskListPath = await openHydratedPage(page);

  await choose(page, VALUE_TYPE, 'Indirectly standardised rate');
  await question(page, HAS_COUNT).getByLabel('No').check();
  await choose(page, RATE_PER, '100');
  await choose(page, RATE_OBJECT, 'expected deaths');
  await continueAndExpectErrors(page, [POPULATION]);
  await referencePopulation(page).fill('England 2019');
  await continueToTaskList(page, taskListPath);

  await expect(referencePopulation(page)).toHaveValue('England 2019');
});

test('has no WCAG 2.2 AA violations with the count and rate questions shown', async ({
  page,
}, testInfo) => {
  await openHydratedPage(page);
  await choose(page, VALUE_TYPE, 'Directly standardised rate');
  await question(page, STANDARD_POPULATION).getByLabel('Other').check();
  await question(page, HAS_COUNT).getByLabel('Yes').check();
  await choose(page, COUNT_MEASURE, 'people');
  await choose(page, RATE_PER, '100,000');
  await choose(page, RATE_OBJECT, 'people');
  await expect(page.getByRole('heading', { name: PREVIEW })).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the submission is rejected', async ({
  page,
}, testInfo) => {
  await openHydratedPage(page);
  await choose(page, VALUE_TYPE, 'Proportion');
  await question(page, HAS_COUNT).getByLabel('Yes').check();
  await continueAndExpectErrors(page, [
    'Select what the count is measuring',
    'Select whether the value is measuring the same thing as the count',
  ]);

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows every follow-up question, naming what each is for', async ({ page }) => {
    await openSectionPage(page, SECTION);

    await expect(question(page, STANDARD_POPULATION)).toBeVisible();
    await expect(standardPopulationOther(page)).toHaveAccessibleDescription(
      'Only needed for Other standard populations',
    );
    await expect(referencePopulation(page)).toHaveAccessibleDescription(
      'Only needed for Indirectly standardised proportion, Indirectly standardised rate or Indirectly standardised ratio',
    );
    await expect(page.getByLabel(COUNT_MEASURE)).toHaveAccessibleDescription(
      'Only needed for Count, or if there is a count',
    );
    await expect(page.getByLabel(RATE_PER)).toHaveAccessibleDescription(
      'Only needed for Crude rate, Directly standardised rate or Indirectly standardised rate',
    );
    await expect(page.getByLabel(GAP_OBJECT)).toHaveAccessibleDescription('Only needed for Gap');
    for (const legend of [HAS_COUNT, SAME_AS_COUNT, RATIO_FORMAT]) {
      await expect(question(page, legend)).toBeVisible();
    }
    await expect(page.getByLabel(VALUE_MEASURE)).toBeVisible();
    await expect(page.getByLabel(RATE_OBJECT_OTHER)).toHaveAccessibleDescription(
      'Only needed for Other. Use lowercase letters, except for proper nouns',
    );
  });

  test('asks only for the answers the chosen value type needs, and previews them once saved', async ({
    page,
  }) => {
    const taskListPath = await openSectionPage(page, SECTION);

    await choose(page, VALUE_TYPE, 'Count');
    await referencePopulation(page).fill('Ignored beside a count');
    await choose(page, RATE_OBJECT, 'Other');
    await page.getByLabel(RATE_OBJECT_OTHER).fill('Ignored beside a count');
    await continueAndExpectErrors(page, ['Select what the count is measuring'], false);

    await choose(page, COUNT_MEASURE, 'people');
    await continueToTaskList(page, taskListPath);

    await expect(referencePopulation(page)).toHaveValue('');
    await expect(page.getByLabel(RATE_OBJECT_OTHER)).toHaveValue('');
    await expectPreview(page, '-', '[number] people');
  });
});
