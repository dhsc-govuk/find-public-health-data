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
import { ANSWER_DETAIL, expectQuestionStyles, QUESTION } from '../support/typography.ts';

const SECTION: Section = {
  key: 'other-notes-and-caveats',
  taskName: 'Quality, caveats and interpretation',
};
const HEADING = 'Quality, caveats and interpretation';
const DATA_QUALITY = 'Are there any data quality issues with this indicator?';
const CAVEATS = 'Are there any caveats needed?';
const NOTES = 'Are there any additional interpretation notes needed?';
const QUESTIONS = [DATA_QUALITY, CAVEATS, NOTES];
const DETAILS = 'Provide details';

const DATA_QUALITY_REFUSAL = 'Select whether there are any data quality issues with this indicator';
const CAVEATS_REFUSAL = 'Select whether there are any caveats needed';
const NOTES_REFUSAL = 'Select whether there are any additional interpretation notes needed';
const CAVEATS_DETAILS_REFUSAL = 'Provide details of the caveats';
const NOTES_DETAILS_REFUSAL = 'Provide details of the additional interpretation notes';
const CAVEATS_FOR_DATA_QUALITY =
  "If there are data quality issues, you need to explain these in the 'Caveats' section";
const CAVEATS_PROMPT = 'You need to clearly explain the data quality issues with this indicator.';

test.use({ storageState: PUBLISHER.storageState });

function question(page: Page, legend: string) {
  return page.getByRole('group', { name: legend });
}

function answer(page: Page, legend: string, label: 'Yes' | 'No') {
  return question(page, legend).getByLabel(label, { exact: true });
}

function details(page: Page, legend: string) {
  return question(page, legend).getByLabel(DETAILS);
}

function continueForm(page: Page) {
  return page.getByRole('button', { name: 'Continue' }).click();
}

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Related guidance for this section/ }),
    ).toBeVisible();
    await expect(question(page, DATA_QUALITY)).toHaveAccessibleDescription(
      /clearly explained in the 'Caveats' section/,
    );
    await expect(page.getByText(CAVEATS_PROMPT)).toHaveCount(0);
    for (const legend of QUESTIONS) {
      await expect(question(page, legend)).toBeVisible();
    }
    await expect(page.getByRole('main').getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(page.getByText(/rounding/i)).toHaveCount(0);
  },
  refusal: {
    messages: [DATA_QUALITY_REFUSAL, CAVEATS_REFUSAL, NOTES_REFUSAL],
    follow: NOTES_REFUSAL,
    focuses: (page) => answer(page, NOTES, 'Yes'),
  },
});

// The size and weight come from a class, so only a browser can tell them apart.
test('asks every question at the same size and weight', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await expectQuestionStyles(page, QUESTIONS, QUESTION);
  await expectQuestionStyles(page, [DETAILS, DETAILS], ANSWER_DETAIL);
});

test('reveals the caveats and notes details only while Yes is chosen', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await expect(question(page, DATA_QUALITY).getByLabel(DETAILS)).toHaveCount(0);
  for (const legend of [CAVEATS, NOTES]) {
    await expect(details(page, legend)).toBeHidden();
    await answer(page, legend, 'Yes').check();
    await expect(details(page, legend)).toBeVisible();
    await answer(page, legend, 'No').check();
    await expect(details(page, legend)).toBeHidden();
  }
});

test('asks for the details of caveats and notes answered Yes without them', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await answer(page, DATA_QUALITY, 'No').check();
  await answer(page, CAVEATS, 'Yes').check();
  await answer(page, NOTES, 'Yes').check();
  await continueForm(page);

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([
    CAVEATS_DETAILS_REFUSAL,
    NOTES_DETAILS_REFUSAL,
  ]);
  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: NOTES_DETAILS_REFUSAL, exact: true }).click();
  await expect(details(page, NOTES)).toBeFocused();
});

test('refuses no caveats beside data quality issues and prompts for them', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;

  await answer(page, DATA_QUALITY, 'Yes').check();
  await answer(page, CAVEATS, 'No').check();
  await answer(page, NOTES, 'No').check();
  await continueForm(page);

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([CAVEATS_FOR_DATA_QUALITY]);
  await expect(question(page, CAVEATS)).toContainText(CAVEATS_PROMPT);
  await expect(answer(page, DATA_QUALITY, 'Yes')).toBeChecked();
  await expect(answer(page, CAVEATS, 'No')).toBeChecked();
  await expectNoAccessibilityViolations(page, testInfo);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: CAVEATS_FOR_DATA_QUALITY, exact: true }).click();
  await expect(answer(page, CAVEATS, 'Yes')).toBeFocused();

  await page.goto(pagePath);
  await expect(page.getByRole('main').getByRole('radio', { checked: true })).toHaveCount(0);
});

test('saves every answer on Continue and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await answer(page, DATA_QUALITY, 'Yes').check();
  await answer(page, CAVEATS, 'Yes').check();
  await details(page, CAVEATS).fill('  Survey data.  ');
  await answer(page, NOTES, 'Yes').check();
  await details(page, NOTES).fill('\tRevised in 2024. ');
  await continueForm(page);

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(answer(page, DATA_QUALITY, 'Yes')).toBeChecked();
  await expect(question(page, CAVEATS)).toContainText(CAVEATS_PROMPT);
  await expect(answer(page, CAVEATS, 'Yes')).toBeChecked();
  await expect(details(page, CAVEATS)).toHaveValue('Survey data.');
  await expect(answer(page, NOTES, 'Yes')).toBeChecked();
  await expect(details(page, NOTES)).toHaveValue('Revised in 2024.');
});

test('forgets the details of a question once it is answered No instead', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await answer(page, DATA_QUALITY, 'No').check();
  await answer(page, CAVEATS, 'Yes').check();
  await details(page, CAVEATS).fill('Survey data.');
  await answer(page, NOTES, 'Yes').check();
  await details(page, NOTES).fill('Revised in 2024.');
  await continueForm(page);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await answer(page, CAVEATS, 'No').check();
  await continueForm(page);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(answer(page, CAVEATS, 'No')).toBeChecked();
  await expect(details(page, NOTES)).toHaveValue('Revised in 2024.');
  await answer(page, CAVEATS, 'Yes').check();
  await expect(details(page, CAVEATS)).toBeEmpty();
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the answers are refused', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await continueForm(page);
  await expect(page.getByRole('alert')).toContainText(DATA_QUALITY_REFUSAL);

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows both details fields, prompts for caveats after a refusal and saves', async ({
    page,
  }) => {
    const taskListPath = await openSectionPage(page, SECTION);

    await expect(details(page, CAVEATS)).toBeVisible();
    await expect(details(page, NOTES)).toBeVisible();

    await answer(page, DATA_QUALITY, 'Yes').check();
    await answer(page, CAVEATS, 'No').check();
    await answer(page, NOTES, 'No').check();
    await continueForm(page);
    await expect(page.getByRole('alert')).toContainText(CAVEATS_FOR_DATA_QUALITY);
    await expect(question(page, CAVEATS)).toContainText(CAVEATS_PROMPT);

    await answer(page, CAVEATS, 'Yes').check();
    await details(page, CAVEATS).fill('Survey data.');
    await continueForm(page);

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  });
});
