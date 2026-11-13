import { expect, type Locator, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const SECTION: Section = { key: 'update-frequency', taskName: 'Update frequency' };
const QUESTION = 'How often will this indicator be updated?';
const NO_FIXED = 'No fixed frequency';
const NO_LONGER_UPDATED = 'This indicator will no longer be updated';
const NO_FIXED_ERROR = 'Enter the reason this indicator has no fixed update frequency';
const NO_LONGER_UPDATED_ERROR = 'Enter the reason this indicator will no longer be updated';

function answer(page: Page, label: string): Locator {
  return page.getByLabel(label, { exact: true });
}

/** The "Enter reason" box inside the reveal that the named answer controls. */
async function reasonFor(page: Page, label: string): Promise<Locator> {
  const reveal = await answer(page, label).getAttribute('aria-controls');
  return page.locator(`#${reveal}`).getByLabel('Enter reason', { exact: true });
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: QUESTION })).toBeVisible();
    const options = page.getByRole('group', { name: QUESTION }).getByRole('radio');
    await expect(options).toHaveCount(6);
    for (const option of await options.all()) {
      await expect(option).not.toBeChecked();
    }
    await expect(page.locator('.govuk-radios__divider')).toHaveText('or');
  },
  refusal: {
    messages: ['Select how often this indicator will be updated'],
    focuses: (page) => page.getByLabel('Monthly', { exact: true }),
  },
});

test('reveals a reason under each answer that asks for one, only while it is chosen', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);
  const noFixedReason = await reasonFor(page, NO_FIXED);
  const noLongerUpdatedReason = await reasonFor(page, NO_LONGER_UPDATED);

  await expect(noFixedReason).toBeHidden();
  await expect(noLongerUpdatedReason).toBeHidden();

  await answer(page, NO_FIXED).check();
  await expect(noFixedReason).toBeVisible();
  await expect(noLongerUpdatedReason).toBeHidden();

  await answer(page, NO_LONGER_UPDATED).check();
  await expect(noFixedReason).toBeHidden();
  await expect(noLongerUpdatedReason).toBeVisible();

  await answer(page, 'Annually').check();
  await expect(noLongerUpdatedReason).toBeHidden();
});

test.describe('asks for the reason when its answer is chosen without one', () => {
  for (const [label, message] of [
    [NO_FIXED, NO_FIXED_ERROR],
    [NO_LONGER_UPDATED, NO_LONGER_UPDATED_ERROR],
  ] as const) {
    test(label, async ({ page }) => {
      await openSectionPage(page, SECTION);

      await answer(page, label).check();
      await page.getByRole('button', { name: 'Continue' }).click();

      const summary = page.getByRole('alert');
      await expect(summary.getByRole('link')).toHaveText([message]);
      await expect(answer(page, label)).toBeChecked();

      await expectErrorSummaryReady(page);
      await summary.getByRole('link', { name: message }).click();
      await expect(await reasonFor(page, label)).toBeFocused();
    });
  }
});

test('saves the update frequency and its reason on Continue and shows the task as completed', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await answer(page, NO_LONGER_UPDATED).check();
  await (await reasonFor(page, NO_LONGER_UPDATED)).fill('  The survey has ended.  ');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(answer(page, NO_LONGER_UPDATED)).toBeChecked();
  await expect(await reasonFor(page, NO_LONGER_UPDATED)).toHaveValue('The survey has ended.');
});

test('forgets the reason once another answer is chosen', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await answer(page, NO_FIXED).check();
  await (await reasonFor(page, NO_FIXED)).fill('Published when the survey runs.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await answer(page, 'Every 2 years').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(answer(page, 'Every 2 years')).toBeChecked();
  await answer(page, NO_FIXED).check();
  await expect(await reasonFor(page, NO_FIXED)).toBeEmpty();
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations with a reason revealed and refused', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, SECTION);
  await answer(page, NO_FIXED).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText(NO_FIXED_ERROR);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the submission is rejected', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, SECTION);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Select how often this indicator will be updated',
  );

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('refuses an unanswered form and then saves the update frequency', async ({ page }) => {
    const taskListPath = await openSectionPage(page, SECTION);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Select how often this indicator will be updated',
    );

    await page.getByLabel('Quarterly', { exact: true }).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  });

  test('shows both reasons, and keeps only the one under the chosen answer', async ({ page }) => {
    await openSectionPage(page, SECTION);
    const pagePath = new URL(page.url()).pathname;

    await expect(await reasonFor(page, NO_FIXED)).toBeVisible();
    await expect(await reasonFor(page, NO_LONGER_UPDATED)).toBeVisible();

    await answer(page, NO_FIXED).check();
    await (await reasonFor(page, NO_FIXED)).fill('Published when the survey runs.');
    await (await reasonFor(page, NO_LONGER_UPDATED)).fill('The survey has ended.');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

    await page.goto(pagePath);
    await expect(answer(page, NO_FIXED)).toBeChecked();
    await expect(await reasonFor(page, NO_FIXED)).toHaveValue('Published when the survey runs.');
    await expect(await reasonFor(page, NO_LONGER_UPDATED)).toBeEmpty();
  });
});
