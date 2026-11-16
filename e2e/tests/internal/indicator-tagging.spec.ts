import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { chooseOption } from '../support/select-autocomplete.ts';
import { PUBLISHER } from '../support/sign-in.ts';
import { expectQuestionStyles, QUESTION, SUB_QUESTION } from '../support/typography.ts';

const SECTION: Section = { key: 'tagging', taskName: 'Tagging' };
const TITLE = 'Add tags for this indicator';
const INTRO = 'You can select as many tags as are relevant to this indicator.';
const FRAMEWORK_QUESTION = 'Is this indicator part of a framework or programme?';
const LIFE_STAGE_QUESTION = 'Do you need to include the life stage the indicator relates to?';
const RISK_FACTOR_QUESTION = 'Does this indicator include a risk factor?';
const PHOF = 'Public Health Outcomes Framework (PHOF)';
const PHOF_NUMBER = 'Enter PHOF indicator number';
const CHILDREN = 'Children (0 to 15 years old)';

/** A tag list's select, Add button and the noun its Remove buttons name, by the page's words. */
const LISTS = {
  topic: { label: 'Select a topic', add: 'Add topic', noun: 'topic' },
  type: { label: 'Select a measure type', add: 'Add measure type', noun: 'measure type' },
  framework: {
    label: 'Select a framework or programme',
    add: 'Add framework or programme',
    noun: 'framework or programme',
  },
  lifeStage: { label: 'Select a life stage', add: 'Add life stage', noun: 'life stage' },
  riskFactor: { label: 'Select a risk factor', add: 'Add risk factor', noun: 'risk factor' },
} as const;

type List = keyof typeof LISTS;

function question(page: Page, name: string) {
  return page.getByRole('group', { name });
}

function select(page: Page, label: string) {
  return page.getByLabel(label, { exact: true });
}

/** Chooses an option; `navigates` is for pages without JavaScript, which have a plain select. */
async function choose(page: Page, label: string, option: string, navigates: boolean) {
  if (navigates) await select(page, label).selectOption({ label: option });
  else await chooseOption(page, label, option);
}

/** Presses a button that posts the form, waiting for the page it answers without JavaScript. */
async function press(page: Page, name: string, navigates: boolean) {
  const navigation = navigates
    ? page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() })
    : undefined;
  await page.getByRole('button', { name, exact: true }).click();
  if (navigation) {
    await navigation;
    await page.waitForLoadState();
  }
}

function removeButton(page: Page, noun: string, name: string) {
  return page.getByRole('button', { name: `Remove ${noun} ${name}`, exact: true });
}

/** The tags added so far, read from their Remove buttons in page order. */
function removeButtons(page: Page, noun: string) {
  return page.getByRole('button', { name: new RegExp(`^Remove ${noun} `) });
}

/** Adds a tag with its list's Add button. */
async function addTag(page: Page, list: List, name: string, navigates = false) {
  await choose(page, LISTS[list].label, name, navigates);
  await press(page, LISTS[list].add, navigates);
  await expect(removeButton(page, LISTS[list].noun, name)).toBeVisible();
}

/** Adds a topic that has subtopics with one of them, which the page asks for once it is chosen. */
async function addTopic(page: Page, topic: string, subtopic: string, navigates = false) {
  await choose(page, LISTS.topic.label, topic, navigates);
  await press(page, LISTS.topic.add, navigates);
  await choose(page, `Select a subtopic for ${topic}`, subtopic, navigates);
  await press(page, 'Add topic and subtopic', navigates);
  await expect(removeButton(page, 'topic', `${topic}: ${subtopic}`)).toBeVisible();
}

async function answer(page: Page, name: string, choice: 'Yes' | 'No') {
  await question(page, name).getByLabel(choice, { exact: true }).check();
}

/** The option names of the select named `name`, without its "Select" prompt. */
async function optionsOf(page: Page, name: string) {
  const names = await page.locator(`select[name="${name}"] option`).allTextContents();
  return names.filter((option) => option !== 'Select');
}

async function tagEverything(page: Page) {
  await addTopic(page, 'Diabetes', 'Care and treatment');
  await addTag(page, 'topic', 'Dental and oral health');
  await addTag(page, 'type', 'Outcome');
  await answer(page, FRAMEWORK_QUESTION, 'No');
  await answer(page, LIFE_STAGE_QUESTION, 'Yes');
  await addTag(page, 'lifeStage', CHILDREN);
  await answer(page, RISK_FACTOR_QUESTION, 'Yes');
  await addTag(page, 'riskFactor', 'Alcohol');
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(select(page, LISTS.topic.label)).toHaveValue('');
    await expect(question(page, LIFE_STAGE_QUESTION).getByLabel('Yes')).not.toBeChecked();
  },
  refusal: {
    messages: [
      'Select at least one topic',
      'Select a measure type',
      'Select whether this indicator is part of a framework or programme',
      'Select whether you need to include the life stage the indicator relates to',
      'Select whether this indicator includes a risk factor',
    ],
    focuses: (page) => select(page, LISTS.topic.label),
  },
});

test('asks for topic, measure type, framework, life stage and risk factor, in that order', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);

  await expect(page.getByText(INTRO)).toBeVisible();
  await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveText([
    LISTS.topic.label,
    LISTS.type.label,
    FRAMEWORK_QUESTION,
    LIFE_STAGE_QUESTION,
    RISK_FACTOR_QUESTION,
  ]);
  await expect(
    page.getByText('Does this indicator provide population or area context?'),
  ).toHaveCount(0);
  await expect(page.getByText('Select a primary topic')).toHaveCount(0);
  await expect(page.getByText(/age metadata/)).toHaveCount(0);
});

test("offers the topics, measure types, frameworks, life stages and risk factors in the design's words", async ({
  page,
}) => {
  await openSectionPage(page, SECTION);

  expect(await optionsOf(page, 'addTopic')).toContain(
    'Heart, kidney and cardiovascular-related diseases',
  );
  expect(await optionsOf(page, 'addIndicatorType')).toEqual([
    'Data quality',
    'Inequality summary measure',
    'Intervention or service',
    'Outcome',
    'Risk factor',
    'Screening or testing',
    'Wider determinant',
  ]);
  expect(await optionsOf(page, 'addFramework')).toEqual([
    'Local Outcomes Framework (LOF): Health and wellbeing domain',
    PHOF,
  ]);
  expect(await optionsOf(page, 'addLifeStage')).toEqual([
    'Pregnancy and babies',
    CHILDREN,
    'Young people (16 to 24 years old)',
    'Working-age adults (16 to 64 years old)',
    'Older people (65 years old and over)',
  ]);
  expect(await optionsOf(page, 'addRiskFactor')).toEqual([
    'Air pollution or environment',
    'Alcohol',
    'Diet and nutrition',
    'Drug use',
    'Excess weight or obesity',
    'Gambling',
    'High blood pressure or cholesterol',
    'Physical activity or inactivity',
    'Smoking and tobacco',
    'Violence',
  ]);
});

// Yes reveals a question of its own rather than the details of an answer, so it is a heading
// like the pickers the page asks for outright, a level below them.
test('asks the questions under Yes at the same size and weight', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await answer(page, FRAMEWORK_QUESTION, 'Yes');
  await answer(page, LIFE_STAGE_QUESTION, 'Yes');
  await answer(page, RISK_FACTOR_QUESTION, 'Yes');

  await expectQuestionStyles(
    page,
    [LISTS.framework.label, LISTS.lifeStage.label, LISTS.riskFactor.label],
    SUB_QUESTION,
  );
  await expectQuestionStyles(
    page,
    [
      LISTS.topic.label,
      LISTS.type.label,
      FRAMEWORK_QUESTION,
      LIFE_STAGE_QUESTION,
      RISK_FACTOR_QUESTION,
    ],
    QUESTION,
  );
});

test('reveals the frameworks, life stages and risk factors only while "Yes" is chosen', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);
  const pickers = [LISTS.framework.label, LISTS.lifeStage.label, LISTS.riskFactor.label];

  for (const label of pickers) await expect(select(page, label)).toBeHidden();

  await answer(page, FRAMEWORK_QUESTION, 'Yes');
  await answer(page, LIFE_STAGE_QUESTION, 'Yes');
  await answer(page, RISK_FACTOR_QUESTION, 'Yes');
  for (const label of pickers) await expect(select(page, label)).toBeVisible();

  await answer(page, RISK_FACTOR_QUESTION, 'No');
  await expect(select(page, LISTS.riskFactor.label)).toBeHidden();
});

test('asks "Select a subtopic for" a topic that has subtopics, and adds the two together', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, SECTION);

  await choose(page, LISTS.topic.label, 'Cancer', false);
  await press(page, LISTS.topic.add, false);
  await expect(select(page, 'Select a subtopic for Cancer')).toBeVisible();
  expect(await optionsOf(page, 'addSubtopic')).toEqual([
    'All cancers',
    'Bowel cancer',
    'Breast cancer',
    'Other cancers',
  ]);
  await expect(removeButtons(page, 'topic')).toHaveCount(0);
  await expectNoAccessibilityViolations(page, testInfo);

  await choose(page, 'Select a subtopic for Cancer', 'Bowel cancer', false);
  await press(page, 'Add topic and subtopic', false);
  await addTag(page, 'topic', 'Dental and oral health');

  await expect(removeButtons(page, 'topic')).toHaveText([
    'Remove topic Cancer: Bowel cancer',
    'Remove topic Dental and oral health',
  ]);
  await expect(page.getByLabel(/^Select a subtopic for/)).toHaveCount(0);
});

test('refuses a topic that has subtopics without one of them', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await choose(page, LISTS.topic.label, 'Diabetes', false);
  await press(page, LISTS.topic.add, false);

  await press(page, 'Add topic and subtopic', false);

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Select a subtopic for Diabetes']);
  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(select(page, 'Select a subtopic for Diabetes')).toBeFocused();

  // Continue takes in a chosen topic only with its subtopic.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert').getByRole('link')).toContainText([
    'Select a subtopic for Diabetes',
  ]);
});

test('asks for an optional PHOF indicator number once the Public Health Outcomes Framework is added', async ({
  page,
}, testInfo) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await tagEverything(page);
  await answer(page, FRAMEWORK_QUESTION, 'Yes');
  await addTag(page, 'framework', 'Local Outcomes Framework (LOF): Health and wellbeing domain');
  await expect(page.getByLabel(PHOF_NUMBER)).toHaveCount(0);

  await addTag(page, 'framework', PHOF);
  await expect(page.getByLabel(PHOF_NUMBER)).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
  await page.getByLabel(PHOF_NUMBER).fill('4.05i');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);

  await page.goto(pagePath);
  await expect(page.getByLabel(PHOF_NUMBER)).toHaveValue('4.05i');

  await removeButton(page, LISTS.framework.noun, PHOF).click();
  await expect(page.getByLabel(PHOF_NUMBER)).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);
  await page.goto(pagePath);
  await addTag(page, 'framework', PHOF);
  await expect(page.getByLabel(PHOF_NUMBER)).toHaveValue('');
});

test('adds tags to each list and removes them, clearing the select', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await addTag(page, 'topic', 'Dental and oral health');
  await addTopic(page, 'Cancer', 'All cancers');
  await addTopic(page, 'Cancer', 'Breast cancer');
  await addTag(page, 'type', 'Outcome');

  await expect(removeButtons(page, 'topic')).toHaveText([
    'Remove topic Dental and oral health',
    'Remove topic Cancer: All cancers',
    'Remove topic Cancer: Breast cancer',
  ]);
  await expect(select(page, LISTS.topic.label)).toHaveValue('');

  await removeButton(page, 'topic', 'Dental and oral health').click();
  await removeButton(page, 'topic', 'Cancer: All cancers').click();

  await expect(removeButtons(page, 'topic')).toHaveText(['Remove topic Cancer: Breast cancer']);
  await expect(removeButtons(page, 'measure type')).toHaveText(['Remove measure type Outcome']);
});

test('asks for a tag when Add is selected with none chosen', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await page.getByRole('button', { name: LISTS.topic.add, exact: true }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Select a topic']);
  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(select(page, LISTS.topic.label)).toBeFocused();
});

test('asks for a framework, a life stage and a risk factor beside "Yes"', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await addTag(page, 'topic', 'Dental and oral health');
  await addTag(page, 'type', 'Outcome');
  await answer(page, FRAMEWORK_QUESTION, 'Yes');
  await answer(page, LIFE_STAGE_QUESTION, 'Yes');
  await answer(page, RISK_FACTOR_QUESTION, 'Yes');

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Select at least one framework or programme',
    'Select at least one life stage',
    'Select at least one risk factor',
  ]);
  await expect(removeButtons(page, 'topic')).toHaveText(['Remove topic Dental and oral health']);
});

test('saves nothing until Continue is selected', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await addTag(page, 'topic', 'Dental and oral health');

  await page.goto(pagePath);

  await expect(removeButtons(page, 'topic')).toHaveCount(0);
});

test('saves the tags on Continue and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  await tagEverything(page);
  await removeButton(page, 'measure type', 'Outcome').click();
  // Chosen but not added, which Continue takes in.
  await chooseOption(page, LISTS.type.label, 'Screening or testing');

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  // Saved topics are shown by title.
  await expect(removeButtons(page, 'topic')).toHaveText([
    'Remove topic Dental and oral health',
    'Remove topic Diabetes: Care and treatment',
  ]);
  await expect(removeButtons(page, 'measure type')).toHaveText([
    'Remove measure type Screening or testing',
  ]);
  await expect(question(page, FRAMEWORK_QUESTION).getByLabel('No')).toBeChecked();
  await expect(question(page, LIFE_STAGE_QUESTION).getByLabel('Yes')).toBeChecked();
  await expect(removeButtons(page, 'life stage')).toHaveText([`Remove life stage ${CHILDREN}`]);
  await expect(question(page, RISK_FACTOR_QUESTION).getByLabel('Yes')).toBeChecked();
  await expect(removeButtons(page, 'risk factor')).toHaveText(['Remove risk factor Alcohol']);
});

test('saves "No" and forgets any risk factors saved before', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await tagEverything(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);

  await page.goto(pagePath);
  await answer(page, RISK_FACTOR_QUESTION, 'No');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(question(page, RISK_FACTOR_QUESTION).getByLabel('No')).toBeChecked();
  await expect(removeButtons(page, 'risk factor')).toHaveCount(0);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations with tags added and the form refused', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, SECTION);
  await addTopic(page, 'Diabetes', 'Complications');
  await answer(page, RISK_FACTOR_QUESTION, 'Yes');
  await addTag(page, 'riskFactor', 'Alcohol');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('adds and removes tags, then saves them', async ({ page }) => {
    const taskListPath = await openSectionPage(page, SECTION);

    // Conditional reveals stay open without JavaScript.
    await expect(select(page, LISTS.riskFactor.label)).toBeVisible();

    await addTopic(page, 'Diabetes', 'Prevalence and risk', true);
    await addTag(page, 'type', 'Outcome', true);
    await addTag(page, 'framework', PHOF, true);
    await expect(question(page, FRAMEWORK_QUESTION).getByLabel('Yes')).toBeChecked();
    await page.getByLabel(PHOF_NUMBER).fill('2.12');
    await addTag(page, 'lifeStage', CHILDREN, true);
    await addTag(page, 'riskFactor', 'Smoking and tobacco', true);
    await press(page, 'Remove risk factor Smoking and tobacco', true);
    await answer(page, RISK_FACTOR_QUESTION, 'No');
    await expect(page.getByLabel(PHOF_NUMBER)).toHaveValue('2.12');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  });
});
