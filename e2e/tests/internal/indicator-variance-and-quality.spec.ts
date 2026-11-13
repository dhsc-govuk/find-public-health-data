import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';
import { answerTo } from '../support/summary-list.ts';
import { expectQuestionStyles, QUESTION } from '../support/typography.ts';

const SECTION: Section = { key: 'variance-and-quality', taskName: 'Variance and quality' };
const VARIATION = 'How does the indicator vary?';
const QUALITY_ASSURANCE = 'What quality assurance has been done on the indicator?';
const IMPROVEMENTS =
  'If there are any data quality issues, what is being done to improve the quality? (Optional)';
const VARIATION_REFUSAL = 'Enter how the indicator varies';
const QUALITY_ASSURANCE_REFUSAL = 'Enter what quality assurance has been done on the indicator';

test.use({ storageState: PUBLISHER.storageState });

function continueForm(page: Page) {
  return page.getByRole('button', { name: 'Continue' }).click();
}

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Variance and quality' }),
    ).toBeVisible();
    await expect(
      page.getByText('The information you provide here is for reviewer use only'),
    ).toBeVisible();
    for (const label of [VARIATION, QUALITY_ASSURANCE, IMPROVEMENTS]) {
      await expect(page.getByLabel(label)).toBeEmpty();
    }
    await expect(page.getByRole('main').getByRole('radio')).toHaveCount(0);
  },
  refusal: {
    messages: [VARIATION_REFUSAL, QUALITY_ASSURANCE_REFUSAL],
    follow: QUALITY_ASSURANCE_REFUSAL,
    focuses: (page) => page.getByLabel(QUALITY_ASSURANCE),
  },
});

// The size and weight come from a class, so only a browser can tell them apart.
test('asks every question at the same size and weight', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await expectQuestionStyles(page, [VARIATION, QUALITY_ASSURANCE, IMPROVEMENTS], QUESTION);
});

test('saves nothing until both required answers are given, keeping what was typed', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;

  await page.getByLabel(VARIATION).fill('Varies by area.');
  await page.getByLabel(IMPROVEMENTS).fill('Chasing late returns.');
  await continueForm(page);

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([QUALITY_ASSURANCE_REFUSAL]);
  await expect(page.getByLabel(VARIATION)).toHaveValue('Varies by area.');
  await expect(page.getByLabel(IMPROVEMENTS)).toHaveValue('Chasing late returns.');

  await page.goto(pagePath);
  await expect(page.getByLabel(VARIATION)).toBeEmpty();
  await expect(page.getByLabel(IMPROVEMENTS)).toBeEmpty();
});

test('saves every answer on Continue and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await page.getByLabel(VARIATION).fill('  Varies by area.  ');
  await page.getByLabel(QUALITY_ASSURANCE).fill('Checked against ONS figures.');
  await page.getByLabel(IMPROVEMENTS).fill('\tChasing late returns. ');
  await continueForm(page);

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(page.getByLabel(VARIATION)).toHaveValue('Varies by area.');
  await expect(page.getByLabel(QUALITY_ASSURANCE)).toHaveValue('Checked against ONS figures.');
  await expect(page.getByLabel(IMPROVEMENTS)).toHaveValue('Chasing late returns.');
});

test('completes the task with the data quality improvements left blank', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await page.getByLabel(VARIATION).fill('Varies by area.');
  await page.getByLabel(QUALITY_ASSURANCE).fill('Checked against ONS figures.');
  await continueForm(page);

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(page.getByLabel(IMPROVEMENTS)).toBeEmpty();
});

test('shows the data quality improvements to reviewers only once they are given', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  const overviewPath = taskListPath.replace(/^\/publish(.*)\/task-list$/, '/dashboard$1');
  const question =
    'If there are any data quality issues, what is being done to improve the quality?';

  await page.getByLabel(VARIATION).fill('Varies by area.');
  await page.getByLabel(QUALITY_ASSURANCE).fill('Checked against ONS figures.');
  await continueForm(page);
  await expect(page).toHaveURL(taskListPath);
  await page.goto(overviewPath);
  await page.getByRole('tab', { name: 'Notes for reviewers' }).click();

  await expect(answerTo(page, QUALITY_ASSURANCE)).toHaveText('Checked against ONS figures.');
  await expect(answerTo(page, question)).toHaveCount(0);

  await page.goto(pagePath);
  await page.getByLabel(IMPROVEMENTS).fill('Chasing late returns.');
  await continueForm(page);
  await expect(page).toHaveURL(taskListPath);
  await page.goto(overviewPath);
  await page.getByRole('tab', { name: 'Notes for reviewers' }).click();

  await expect(answerTo(page, question)).toHaveText('Chasing late returns.');
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the answers are refused', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await continueForm(page);
  await expect(page.getByRole('alert')).toContainText(VARIATION_REFUSAL);

  await expectNoAccessibilityViolations(page, testInfo);
});
