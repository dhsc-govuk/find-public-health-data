import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const SECTION: Section = { key: 'confidence-intervals', taskName: 'Confidence intervals' };
const METHOD = 'Select the confidence interval method used';
const MODIFIED = 'Were any modifications to the described method used for this indicator?';
const MODIFICATIONS = 'Enter description of the modifications used';
const OTHER_DETAIL = 'Provide detail of the other confidence interval method used';
const SELECT_MODIFIED = 'Select whether any modifications to the described method were used';
const WHAT_AN_INTERVAL_IS = /^A confidence interval is a range of values/;
const BYARS_DESCRIPTION = /^Byar’s method gives very accurate approximate confidence intervals/;
const NONE_AVAILABLE_DESCRIPTION = /^Without confidence intervals it is impossible to know/;

/** The page once hydrated, which hides the follow-ups while no method is chosen. */
async function openHydratedPage(page: Page): Promise<string> {
  const taskListPath = await openSectionPage(page, SECTION);
  await expect(page.getByLabel(OTHER_DETAIL)).toBeHidden();

  return taskListPath;
}

async function chooseMethod(page: Page, name: string) {
  await page.getByLabel(METHOD).selectOption({ label: name });
}

function modifiedQuestion(page: Page) {
  return page.getByRole('group', { name: MODIFIED });
}

function standardDescription(page: Page) {
  return page.getByRole('heading', { level: 2, name: 'Standard method description' });
}

async function continueAndExpectErrors(page: Page, messages: string[]) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveTitle(/^Error: /);
  await expect(page.getByRole('alert').getByRole('link')).toHaveText(messages);
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Confidence intervals' }),
    ).toBeVisible();
    await expect(page.getByLabel(METHOD).locator('option:checked')).toHaveText('Select');
  },
  refusal: {
    messages: [METHOD],
    focuses: (page) => page.getByLabel(METHOD),
  },
});

test('shows only the questions the chosen method asks', async ({ page }) => {
  await openHydratedPage(page);

  await expect(modifiedQuestion(page)).toBeHidden();
  await expect(page.getByLabel(OTHER_DETAIL)).toBeHidden();

  await chooseMethod(page, "Byar's method");
  await expect(standardDescription(page)).toBeVisible();
  await expect(page.getByText(WHAT_AN_INTERVAL_IS)).toBeVisible();
  await expect(page.getByText(BYARS_DESCRIPTION)).toBeVisible();
  await expect(modifiedQuestion(page)).toBeVisible();
  await expect(page.getByLabel(OTHER_DETAIL)).toBeHidden();

  await chooseMethod(page, 'T-distribution method');
  await expect(standardDescription(page)).toBeVisible();
  await expect(page.getByText(WHAT_AN_INTERVAL_IS)).toBeVisible();
  await expect(page.getByText(BYARS_DESCRIPTION)).toBeHidden();
  await expect(modifiedQuestion(page)).toBeVisible();

  await chooseMethod(page, 'Other method');
  await expect(standardDescription(page)).toBeHidden();
  await expect(modifiedQuestion(page)).toBeHidden();
  await expect(page.getByLabel(OTHER_DETAIL)).toBeVisible();

  await chooseMethod(page, 'No confidence intervals available');
  await expect(standardDescription(page)).toBeVisible();
  await expect(page.getByText(NONE_AVAILABLE_DESCRIPTION)).toBeVisible();
  await expect(page.getByText(WHAT_AN_INTERVAL_IS)).toBeHidden();
  await expect(modifiedQuestion(page)).toBeHidden();
  await expect(page.getByLabel(OTHER_DETAIL)).toBeHidden();
});

test('lists the methods in alphabetical order', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await expect(page.getByLabel(METHOD).locator('option')).toHaveText([
    'Select',
    "Byar's method",
    "Byar's method (adjusted for repeat hospital admissions)",
    'Chiang-Silcocks method',
    "Dobson & Byar's methods",
    'Exact Poisson method',
    'Newcombe-Wilson method',
    'No confidence intervals available',
    'Other method',
    'T-distribution method',
    'Wald normal approximation',
    'Wilson Score method',
  ]);
});

test('saves nothing until the chosen method is fully answered', async ({ page }) => {
  await openHydratedPage(page);
  const pagePath = new URL(page.url()).pathname;

  await chooseMethod(page, "Byar's method");
  await continueAndExpectErrors(page, [SELECT_MODIFIED]);

  await modifiedQuestion(page).getByLabel('Yes').check();
  await continueAndExpectErrors(page, ['Enter a description of the modifications used']);

  await page.goto(pagePath);
  await expect(page.getByLabel(METHOD).locator('option:checked')).toHaveText('Select');
});

test('saves a modified standard method and shows the task as completed', async ({ page }) => {
  const taskListPath = await openHydratedPage(page);

  await chooseMethod(page, "Byar's method");
  await modifiedQuestion(page).getByLabel('Yes').check();
  await page.getByLabel(MODIFICATIONS).fill('  Adjusted for repeat admissions  ');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(page.getByLabel(METHOD).locator('option:checked')).toHaveText("Byar's method");
  await expect(standardDescription(page)).toBeVisible();
  await expect(modifiedQuestion(page).getByLabel('Yes')).toBeChecked();
  await expect(page.getByLabel(MODIFICATIONS)).toHaveValue('Adjusted for repeat admissions');
});

test('saves an other method with its detail and shows the task as completed', async ({ page }) => {
  const taskListPath = await openHydratedPage(page);

  await chooseMethod(page, 'Other method');
  await continueAndExpectErrors(page, ['Enter details of the other confidence interval method']);
  await page.getByLabel(OTHER_DETAIL).fill('Bootstrap intervals');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
});

test('saves a method with nothing to describe on its own', async ({ page }) => {
  const taskListPath = await openHydratedPage(page);

  await chooseMethod(page, 'No confidence intervals available');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
});

// Each scan shows the modifications question, whose radio carries the FPH-446 known violation.
test('has no WCAG 2.2 AA violations with a standard method chosen', async ({ page }, testInfo) => {
  await openHydratedPage(page);
  await chooseMethod(page, "Byar's method");
  await modifiedQuestion(page).getByLabel('Yes').check();
  await expect(page.getByLabel(MODIFICATIONS)).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the submission is rejected', async ({
  page,
}, testInfo) => {
  await openHydratedPage(page);
  await chooseMethod(page, "Byar's method");
  await continueAndExpectErrors(page, [SELECT_MODIFIED]);

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows every follow-up question, naming the methods each is for', async ({ page }) => {
    await openSectionPage(page, SECTION);

    await expect(modifiedQuestion(page)).toBeVisible();
    await expect(
      modifiedQuestion(page).getByText(
        'Not needed for No confidence intervals available or Other method',
      ),
    ).toBeVisible();
    await expect(page.getByLabel(MODIFICATIONS)).toBeVisible();
    await expect(page.getByLabel(OTHER_DETAIL)).toBeVisible();
    await expect(page.getByText('Only needed for Other method')).toBeVisible();
  });

  test('asks only for the answers the chosen method needs', async ({ page }) => {
    const taskListPath = await openSectionPage(page, SECTION);

    await chooseMethod(page, "Byar's method");
    await continueAndExpectErrors(page, [SELECT_MODIFIED]);
    await expect(standardDescription(page)).toBeVisible();

    await chooseMethod(page, 'Other method');
    await page.getByLabel(OTHER_DETAIL).fill('Bootstrap intervals');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  });
});
