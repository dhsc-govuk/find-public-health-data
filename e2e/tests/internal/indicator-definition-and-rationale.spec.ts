import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const SECTION: Section = { key: 'definition-and-rationale', taskName: 'Definition and rationale' };
const DEFINITION = 'What is the definition of this indicator?';
const RATIONALE = 'What is the rationale for this indicator?';

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Definition and rationale' }),
    ).toBeVisible();
    await expect(page.getByLabel(DEFINITION)).toBeEmpty();
    await expect(page.getByLabel(RATIONALE)).toBeEmpty();
  },
  refusal: {
    messages: ['Enter the definition of the indicator', 'Enter the rationale for the indicator'],
    follow: 'Enter the rationale for the indicator',
    focuses: (page) => page.getByLabel(RATIONALE),
  },
});

test('saves nothing until both are answered, keeping what was typed', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;

  await page.getByLabel(DEFINITION).fill('A definition on its own');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Enter the rationale for the indicator',
  ]);
  await expect(page.getByLabel(DEFINITION)).toHaveValue('A definition on its own');

  await page.goto(pagePath);
  await expect(page.getByLabel(DEFINITION)).toBeEmpty();
});

test('saves both answers on Continue and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await page.getByLabel(DEFINITION).fill('  The average number of years a newborn would live.  ');
  await page.getByLabel(RATIONALE).fill('A summary measure of mortality.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(page.getByLabel(DEFINITION)).toHaveValue(
    'The average number of years a newborn would live.',
  );
  await expect(page.getByLabel(RATIONALE)).toHaveValue('A summary measure of mortality.');
});

const CHANGED =
  'Someone else has changed this section since you opened this page. Your answers have not been saved.';

test('refuses a save of the section someone else changed since, keeping what was typed', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  const other = await page.context().newPage();
  await other.goto(pagePath);
  await other.getByLabel(DEFINITION).fill('Their definition');
  await other.getByLabel(RATIONALE).fill('Their rationale');
  await other.getByRole('button', { name: 'Continue' }).click();
  await expect(other).toHaveURL(taskListPath);

  await page.getByLabel(DEFINITION).fill('My definition');
  await page.getByLabel(RATIONALE).fill('My rationale');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(pagePath);
  await expect(page.getByRole('alert')).toContainText(CHANGED);
  await expect(page).toHaveTitle(/^Error: /);
  await expect(page.getByLabel(DEFINITION)).toHaveValue('My definition');
  await expect(page.getByLabel(RATIONALE)).toHaveValue('My rationale');
  await other.goto(pagePath);
  await expect(other.getByLabel(DEFINITION)).toHaveValue('Their definition');
});

test('saves over the other change when Continue is selected again', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  const other = await page.context().newPage();
  await other.goto(pagePath);
  await other.getByLabel(DEFINITION).fill('Their definition');
  await other.getByLabel(RATIONALE).fill('Their rationale');
  await other.getByRole('button', { name: 'Continue' }).click();
  await expect(other).toHaveURL(taskListPath);
  await page.getByLabel(DEFINITION).fill('My definition');
  await page.getByLabel(RATIONALE).fill('My rationale');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText(CHANGED);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await page.goto(pagePath);
  await expect(page.getByLabel(DEFINITION)).toHaveValue('My definition');
});

test('saves the section when only another section changed since', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  const other = await page.context().newPage();
  await other.goto(pagePath.replace(SECTION.key, 'other-comments'));
  await other.getByLabel('No', { exact: true }).check();
  await other.getByRole('button', { name: 'Continue' }).click();
  await expect(other).toHaveURL(taskListPath);

  await page.getByLabel(DEFINITION).fill('My definition');
  await page.getByLabel(RATIONALE).fill('My rationale');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the section changed since', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  const other = await page.context().newPage();
  await other.goto(page.url());
  await other.getByLabel(DEFINITION).fill('Their definition');
  await other.getByLabel(RATIONALE).fill('Their rationale');
  await other.getByRole('button', { name: 'Continue' }).click();
  await expect(other).toHaveURL(/task-list$/);
  await page.getByLabel(DEFINITION).fill('My definition');
  await page.getByLabel(RATIONALE).fill('My rationale');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText(CHANGED);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the submission is rejected', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, SECTION);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter the definition of the indicator');

  await expectNoAccessibilityViolations(page, testInfo);
});
