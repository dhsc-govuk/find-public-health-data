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

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    for (const name of ['Sex', 'Gender', 'Ethnicity'] as const) {
      await expect(collected(page, name)).not.toBeChecked();
    }
  },
  refusal: {
    messages: ['Select what was collected for this indicator'],
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

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

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
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
    await page.goto(pagePath);
    await expect(box(page, ETHNIC_GROUPS, 'Mixed or Multiple ethnic groups')).toBeChecked();
    await expect(box(page, SEXES, 'Male')).not.toBeChecked();
  });
});
