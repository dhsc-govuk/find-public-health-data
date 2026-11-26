import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady, expectHydrated } from '../support/govuk-frontend.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';
import { expectQuestionStyles, SUB_QUESTION } from '../support/typography.ts';

const SECTION: Section = { key: 'benchmarking', taskName: 'Policy goals' };
const TITLE = 'Are there any policy goal benchmarks for this indicator?';
const LOWER = 'Enter lower goal value';
const UPPER = 'Enter upper goal value';
const POLARITY = 'Select polarity of goal';
const DETAIL = 'Provide detail about the policy goal';

/** A goal's label as a screen reader hears it: the first goal's alone, the others' numbered. */
function ofGoal(text: string, goal: number) {
  return goal === 1 ? text : `${text} for policy goal ${goal}`;
}

function label(page: Page, text: string, goal = 1) {
  return page.getByLabel(ofGoal(text, goal), { exact: true });
}

function hasGoal(page: Page, answer: 'Yes' | 'No') {
  return page.getByRole('group', { name: TITLE, exact: true }).getByLabel(answer, { exact: true });
}

function goalPolarity(page: Page, answer: 'High is good' | 'Low is good', goal = 1) {
  return page
    .getByRole('group', { name: ofGoal(POLARITY, goal), exact: true })
    .getByLabel(answer, { exact: true });
}

interface Goal {
  lowerComparison: string;
  lower: string;
  upperComparison?: string;
  upper?: string;
  polarity: 'High is good' | 'Low is good';
  detail?: string;
}

async function answerGoal(page: Page, goal: Goal, number = 1) {
  await label(page, 'Comparison for the lower goal value', number).selectOption({
    label: goal.lowerComparison,
  });
  await label(page, 'Lower goal value', number).fill(goal.lower);
  if (goal.upperComparison !== undefined) {
    await label(page, 'Comparison for the upper goal value', number).selectOption({
      label: goal.upperComparison,
    });
  }
  if (goal.upper !== undefined) await label(page, 'Upper goal value', number).fill(goal.upper);
  await goalPolarity(page, goal.polarity, number).check();
  if (goal.detail !== undefined) await label(page, DETAIL, number).fill(goal.detail);
}

const AMBITION: Goal = {
  lowerComparison: 'Less than',
  lower: ' 2,400 ',
  upperComparison: 'More than or equal to',
  upper: '3250.50',
  polarity: 'High is good',
  detail: 'The national chlamydia detection rate ambition.',
};

const CEILING: Goal = {
  lowerComparison: 'Less than or equal to',
  lower: '-0.5',
  polarity: 'Low is good',
};

async function continueForm(page: Page) {
  await page.getByRole('button', { name: 'Continue' }).click();
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByRole('main').getByRole('radio', { checked: true })).toHaveCount(0);
  },
  refusal: {
    messages: ['Select whether there are any goal benchmarks for this indicator'],
    focuses: (page) => hasGoal(page, 'Yes'),
  },
});

test('links to the guidance between the heading and the question', async ({ page }) => {
  await openSectionPage(page, SECTION);

  const link = page.getByRole('link', { name: 'Related guidance for this section' });
  const heading = await page.getByRole('heading', { level: 1, name: TITLE }).boundingBox();
  const guidance = await link.boundingBox();
  const yes = await hasGoal(page, 'Yes').boundingBox();
  if (!heading || !guidance || !yes) throw new Error('the heading, link and radios must show');

  expect(guidance.y).toBeGreaterThan(heading.y);
  expect(yes.y).toBeGreaterThan(guidance.y);
  await expect(link).toHaveAttribute('href', /#policy-goal$/);
});

// Yes reveals questions of its own, not the details of an answer, so each is a heading.
test('asks the questions under Yes at the same size and weight', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await hasGoal(page, 'Yes').check();

  await expectQuestionStyles(page, [LOWER, UPPER, POLARITY, DETAIL], SUB_QUESTION);
});

test('reveals the goals only while Yes is chosen', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await expectHydrated(page);

  await expect(label(page, 'Lower goal value')).toBeHidden();

  await hasGoal(page, 'Yes').check();
  await expect(page.getByRole('heading', { level: 2, name: 'Policy goal 1' })).toBeVisible();
  await expect(label(page, 'Comparison for the lower goal value')).toBeVisible();
  await expect(label(page, 'Upper goal value')).toBeVisible();
  await expect(goalPolarity(page, 'Low is good')).toBeVisible();
  await expect(label(page, DETAIL)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add another policy goal' })).toBeVisible();

  await hasGoal(page, 'No').check();
  await expect(label(page, 'Lower goal value')).toBeHidden();
});

test('asks for the comparison, lower value and polarity of a goal given none', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await hasGoal(page, 'Yes').check();
  await label(page, 'Upper goal value').fill('5');
  await continueForm(page);

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([
    'Select the comparison for the lower goal value',
    'Enter the lower goal value',
    'Select the comparison for the upper goal value',
    'Select the polarity of the goal',
  ]);
  await expect(hasGoal(page, 'Yes')).toBeChecked();
  // Both refusals of the lower value show on the page, each above its own control.
  await expect(
    page.getByRole('group', { name: LOWER, exact: true }).locator('.govuk-error-message'),
  ).toHaveText([
    'Error: Select the comparison for the lower goal value',
    'Error: Enter the lower goal value',
  ]);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: 'Select the polarity of the goal' }).click();
  await expect(goalPolarity(page, 'High is good')).toBeFocused();
});

test('refuses values that are not numbers, and an upper value not above the lower', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);

  await hasGoal(page, 'Yes').check();
  await answerGoal(page, { ...AMBITION, lower: '90%', upper: '9,5' });
  await continueForm(page);
  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Lower goal value must be a number',
    'Upper goal value must be a number',
  ]);
  await expect(label(page, 'Lower goal value')).toHaveValue('90%');
  await expectErrorSummaryReady(page);

  await label(page, 'Lower goal value').fill('90');
  await label(page, 'Upper goal value').fill('90');
  await continueForm(page);
  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Upper goal value must be higher than the lower goal value',
  ]);
});

test('saves several goals on Continue and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await hasGoal(page, 'Yes').check();
  await answerGoal(page, AMBITION);
  await page.getByRole('button', { name: 'Add another policy goal' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Policy goal 2' })).toBeVisible();
  await expect(label(page, 'Lower goal value')).toHaveValue(' 2,400 ');
  await answerGoal(page, CEILING, 2);
  await continueForm(page);

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(hasGoal(page, 'Yes')).toBeChecked();
  await expect(label(page, 'Comparison for the lower goal value')).toHaveValue('less-than');
  await expect(label(page, 'Lower goal value')).toHaveValue('2400');
  await expect(label(page, 'Comparison for the upper goal value')).toHaveValue(
    'more-than-or-equal',
  );
  await expect(label(page, 'Upper goal value')).toHaveValue('3250.5');
  await expect(goalPolarity(page, 'High is good')).toBeChecked();
  await expect(label(page, DETAIL)).toHaveValue('The national chlamydia detection rate ambition.');
  await expect(label(page, 'Comparison for the lower goal value', 2)).toHaveValue(
    'less-than-or-equal',
  );
  await expect(label(page, 'Lower goal value', 2)).toHaveValue('-0.5');
  await expect(label(page, 'Upper goal value', 2)).toHaveValue('');
  await expect(goalPolarity(page, 'Low is good', 2)).toBeChecked();
});

test('removes a goal, keeping what was typed in the others', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;

  await hasGoal(page, 'Yes').check();
  await answerGoal(page, CEILING);
  await page.getByRole('button', { name: 'Add another policy goal' }).click();
  await answerGoal(page, AMBITION, 2);
  await page.getByRole('button', { name: 'Remove policy goal 1' }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Policy goal 2' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Remove policy goal/ })).toHaveCount(0);
  await expect(label(page, 'Lower goal value')).toHaveValue(' 2,400 ');
  await expect(goalPolarity(page, 'High is good')).toBeChecked();

  await continueForm(page);
  await expect(page).toHaveURL(taskListPath);
  await page.goto(pagePath);
  await expect(page.getByRole('heading', { level: 2, name: /^Policy goal/ })).toHaveText([
    'Policy goal 1',
  ]);
  await expect(label(page, 'Lower goal value')).toHaveValue('2400');
});

test('forgets the goals once it is answered No instead', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await hasGoal(page, 'Yes').check();
  await answerGoal(page, AMBITION);
  await continueForm(page);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await hasGoal(page, 'No').check();
  await continueForm(page);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(hasGoal(page, 'No')).toBeChecked();
  await hasGoal(page, 'Yes').check();
  await expect(label(page, 'Lower goal value')).toBeEmpty();
  await expect(
    page.getByRole('group', { name: POLARITY, exact: true }).getByRole('radio', { checked: true }),
  ).toHaveCount(0);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await hasGoal(page, 'Yes').check();
  await page.getByRole('button', { name: 'Add another policy goal' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Policy goal 2' })).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the goal is refused', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await hasGoal(page, 'Yes').check();
  await label(page, 'Upper goal value').fill('abc');
  await continueForm(page);
  await expect(page.getByRole('alert')).toContainText('Enter the lower goal value');

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('adds and removes goals, and saves the answers', async ({ page }) => {
    const taskListPath = await openSectionPage(page, SECTION);

    await expect(label(page, 'Lower goal value')).toBeVisible();

    await answerGoal(page, AMBITION);
    await page.getByRole('button', { name: 'Add another policy goal' }).click();
    await expect(hasGoal(page, 'Yes')).toBeChecked();
    await answerGoal(page, CEILING, 2);
    await page.getByRole('button', { name: 'Add another policy goal' }).click();
    await page.getByRole('button', { name: 'Remove policy goal 3' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /^Policy goal/ })).toHaveText([
      'Policy goal 1',
      'Policy goal 2',
    ]);
    await continueForm(page);

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  });
});
