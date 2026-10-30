import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { createIndicator, uniqueIndicatorName } from '../support/create-indicator.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import { expectBackToTaskList, expectNotFoundWithoutDraft } from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

function uniqueName() {
  return uniqueIndicatorName('indicator');
}

async function openNamePage(page: Page) {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Create new indicator' }).click();
  await expect(page).toHaveURL('/publish/indicators/new');
}

test.use({ storageState: PUBLISHER.storageState });

test('starts the journey from the indicator dashboard', async ({ page }) => {
  await openNamePage(page);

  await expect(
    page.getByRole('heading', { level: 1, name: 'What is the name of the indicator?' }),
  ).toBeVisible();
  await expect(
    page.getByText('The name should be unique, descriptive and written in plain English.'),
  ).toBeVisible();
});

test('asks for a name when Continue is selected with the box empty', async ({ page }) => {
  await openNamePage(page);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL('/publish/indicators/new');
  await expect(page).toHaveTitle(/^Error: /);
  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Enter the name of the indicator']);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: 'Enter the name of the indicator' }).click();
  await expect(page.getByLabel('What is the name of the indicator?')).toBeFocused();
});

test('creates the indicator and shows its task list', async ({ page }) => {
  const name = uniqueName();

  await createIndicator(page, name);

  await expect(page.getByRole('link', { name: 'Name' })).toBeVisible();
});

test('shows a draft indicator on the dashboard', async ({ page }) => {
  const name = uniqueName();

  await createIndicator(page, name);
  await page.getByRole('link', { name: 'Back to indicator overview', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/indicators\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Back to indicators', exact: true }).click();

  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('link', { name })).toBeVisible();
});

test('refuses a name another indicator already holds', async ({ page }) => {
  const name = uniqueName();
  await createIndicator(page, name);

  await openNamePage(page);
  await page.getByLabel('What is the name of the indicator?').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL('/publish/indicators/new');
  await expect(page.getByRole('alert')).toContainText('An indicator with this name already exists');
  await expect(page).toHaveTitle(/^Error: /);
  await expect(page.getByLabel('What is the name of the indicator?')).toHaveValue(name);
});

test('renames a draft from its name page', async ({ page }) => {
  const name = uniqueName();
  const id = await createIndicator(page, name);
  const taskListPath = new URL(page.url()).pathname;

  await page.goto(`/publish/indicators/${id}/name`);
  const field = page.getByLabel('What is the name of the indicator?');
  await expect(field).toHaveValue(name);

  await field.fill(`${name} renamed`);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(page.getByRole('heading', { level: 1, name: `${name} renamed` })).toBeVisible();
});

test('refuses a rename of a name someone else changed since, keeping what was typed', async ({
  page,
}) => {
  const name = uniqueName();
  const id = await createIndicator(page, name);
  const taskListPath = new URL(page.url()).pathname;
  await page.goto(`/publish/indicators/${id}/name`);
  const other = await page.context().newPage();
  await other.goto(`/publish/indicators/${id}/name`);
  await other.getByLabel('What is the name of the indicator?').fill(`${name} theirs`);
  await other.getByRole('button', { name: 'Continue' }).click();
  await expect(other).toHaveURL(taskListPath);

  await page.getByLabel('What is the name of the indicator?').fill(`${name} mine`);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Someone else has changed the name since you opened this page.',
  );
  await expect(page.getByLabel('What is the name of the indicator?')).toHaveValue(`${name} mine`);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(page.getByRole('heading', { level: 1, name: `${name} mine` })).toBeVisible();
});

test('goes back to the task list from its name page', async ({ page }) => {
  const id = await createIndicator(page, uniqueName());
  const taskListPath = new URL(page.url()).pathname;

  await page.goto(`/publish/indicators/${id}/name`);
  await expectBackToTaskList(page, taskListPath);
});

test('answers a name page with nothing to rename with the not-found page', async ({ page }) => {
  await expectNotFoundWithoutDraft(page, 'name');
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openNamePage(page);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when renaming a draft', async ({ page }, testInfo) => {
  const id = await createIndicator(page, uniqueName());

  await page.goto(`/publish/indicators/${id}/name`);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the submission is rejected', async ({
  page,
}, testInfo) => {
  await openNamePage(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter the name of the indicator');

  await expectNoAccessibilityViolations(page, testInfo);
});
