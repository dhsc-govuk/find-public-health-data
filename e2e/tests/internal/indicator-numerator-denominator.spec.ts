import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { autocompleteInput, chooseOption } from '../support/select-autocomplete.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const NUMERATOR: Section = { key: 'numerator', taskName: 'Numerator' };
const DENOMINATOR: Section = { key: 'denominator', taskName: 'Denominator' };

const PROVIDER_FIELD = 'Add a data provider for the numerator';
const DEFINITION_FIELD = 'Enter the definition of the numerator';

const ONS = 'Office for National Statistics (ONS)';
const DEFRA = 'Department for Environment, Food and Rural Affairs (DEFRA)';

function sourceField(page: Page) {
  return page.getByLabel(/^Add the specific source/);
}

async function chooseSource(page: Page, provider: string, source: string) {
  await chooseOption(page, PROVIDER_FIELD, provider);
  await chooseOption(page, `Add the specific source from ${provider}`, source);
}

async function addSource(page: Page, provider: string, source: string) {
  await chooseSource(page, provider, source);
  await page.getByRole('button', { name: 'Add source' }).click();
  const added = source === 'No specific source' ? provider : `${provider}: ${source}`;
  await expect(addedSources(page).filter({ hasText: added })).toHaveCount(1);
}

/** The text of each source added, in the order the list shows them. */
function addedSources(page: Page) {
  return page.getByRole('main').getByRole('listitem').locator('span:not(.govuk-visually-hidden)');
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(NUMERATOR, {
  expectUnanswered: async (page) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'What are the details of the numerator?' }),
    ).toBeVisible();
    await expect(page.getByLabel(PROVIDER_FIELD, { exact: true })).toHaveValue('');
    await expect(page.getByLabel(DEFINITION_FIELD, { exact: true })).toBeEmpty();
  },
  refusal: {
    messages: [
      'Add at least one data provider for the numerator',
      'Enter the definition of the numerator',
    ],
    focuses: (page) => page.getByLabel(PROVIDER_FIELD, { exact: true }),
  },
});

test("offers a provider's sources once the provider is chosen", async ({ page }) => {
  await openSectionPage(page, NUMERATOR);

  await expect(sourceField(page)).toBeHidden();

  await chooseOption(page, PROVIDER_FIELD, ONS);

  const source = autocompleteInput(page, `Add the specific source from ${ONS}`);
  await expect(source).toBeVisible();
  await source.click();
  const suggestions = page.getByRole('listbox').getByRole('option');
  await expect(suggestions.first()).toHaveText('No specific source');
  await expect(suggestions.filter({ hasText: /^Live births$/ })).toHaveCount(1);
});

test('adds several providers and sources to a list, in the order they were added', async ({
  page,
}) => {
  await openSectionPage(page, NUMERATOR);

  await addSource(page, ONS, 'Live births');
  await addSource(page, DEFRA, 'No specific source');

  await expect(addedSources(page)).toHaveText([`${ONS}: Live births`, DEFRA]);
  await expect(page.getByLabel(PROVIDER_FIELD, { exact: true })).toHaveValue('');
  await expect(sourceField(page)).toBeHidden();
});

test('removes a source from the list', async ({ page }) => {
  await openSectionPage(page, NUMERATOR);
  await addSource(page, ONS, 'Live births');
  await addSource(page, DEFRA, 'No specific source');

  await page.getByRole('button', { name: `Remove ${ONS}: Live births` }).click();

  await expect(addedSources(page)).toHaveText([DEFRA]);
});

test('asks for a source when Add source is selected without one', async ({ page }) => {
  await openSectionPage(page, NUMERATOR);
  await chooseOption(page, PROVIDER_FIELD, ONS);

  await page.getByRole('button', { name: 'Add source' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Select a source, or No specific source']);
  await expect(page.getByLabel(PROVIDER_FIELD, { exact: true })).toHaveValue(/.+/);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(sourceField(page)).toBeFocused();
});

test('refuses a provider and source already added', async ({ page }) => {
  await openSectionPage(page, NUMERATOR);
  await addSource(page, ONS, 'Live births');

  await chooseSource(page, ONS, 'Live births');
  await page.getByRole('button', { name: 'Add source' }).click();

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Select a source that has not already been added',
  ]);
  await expect(addedSources(page)).toHaveText([`${ONS}: Live births`]);
});

test('saves nothing until Continue is selected', async ({ page }) => {
  await openSectionPage(page, NUMERATOR);
  const pagePath = new URL(page.url()).pathname;
  await addSource(page, ONS, 'Live births');

  await page.goto(pagePath);

  await expect(addedSources(page)).toHaveCount(0);
});

test('saves the sources and definition on Continue and shows the task as completed', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, NUMERATOR);
  await addSource(page, ONS, 'Live births');
  await addSource(page, DEFRA, 'No specific source');
  await page.getByLabel(DEFINITION_FIELD, { exact: true }).fill('Live births in the year.');

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, NUMERATOR.taskName)).toContainText('Completed');
  await expect(taskRow(page, DENOMINATOR.taskName)).toContainText('Not started');

  await taskRow(page, NUMERATOR.taskName).getByRole('link').click();
  await expect(addedSources(page)).toHaveText([`${ONS}: Live births`, DEFRA]);
  await expect(page.getByLabel(DEFINITION_FIELD, { exact: true })).toHaveValue(
    'Live births in the year.',
  );
});

test('saves a provider and source chosen but not added when Continue is selected', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, NUMERATOR);
  await chooseSource(page, ONS, 'Live births');
  await page.getByLabel(DEFINITION_FIELD, { exact: true }).fill('Live births in the year.');

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await taskRow(page, NUMERATOR.taskName).getByRole('link').click();
  await expect(addedSources(page)).toHaveText([`${ONS}: Live births`]);
});

test('asks the same of the denominator and saves it apart from the numerator', async ({ page }) => {
  const taskListPath = await openSectionPage(page, DENOMINATOR);
  await expect(
    page.getByRole('heading', { level: 1, name: 'What are the details of the denominator?' }),
  ).toBeVisible();

  await chooseOption(page, 'Add a data provider for the denominator', ONS);
  await chooseOption(page, `Add the specific source from ${ONS}`, 'Mid-year population estimates');
  await page.getByRole('button', { name: 'Add source' }).click();
  await page
    .getByLabel('Enter the definition of the denominator', { exact: true })
    .fill('Resident population.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, DENOMINATOR.taskName)).toContainText('Completed');
  await expect(taskRow(page, NUMERATOR.taskName)).toContainText('Not started');
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, NUMERATOR);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations with sources added and a source refused', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, NUMERATOR);
  await addSource(page, ONS, 'Live births');
  await addSource(page, DEFRA, 'No specific source');
  await chooseOption(page, PROVIDER_FIELD, ONS);
  await page.getByRole('button', { name: 'Add source' }).click();
  await expect(page.getByRole('alert')).toContainText('Select a source');

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test("shows a provider's sources, adds and removes them, then saves them", async ({ page }) => {
    const taskListPath = await openSectionPage(page, NUMERATOR);

    await expect(sourceField(page)).toBeHidden();
    await page.getByLabel(PROVIDER_FIELD, { exact: true }).selectOption({ label: ONS });
    await page.getByRole('button', { name: 'Show sources' }).click();
    await expect(page.getByLabel(`Add the specific source from ${ONS}`)).toBeVisible();
    await sourceField(page).selectOption({ label: 'Live births' });
    await page.getByRole('button', { name: 'Add source' }).click();

    await page.getByLabel(PROVIDER_FIELD, { exact: true }).selectOption({ label: DEFRA });
    await page.getByRole('button', { name: 'Show sources' }).click();
    await sourceField(page).selectOption({ label: 'No specific source' });
    await page.getByRole('button', { name: 'Add source' }).click();
    await expect(addedSources(page)).toHaveText([`${ONS}: Live births`, DEFRA]);

    await page.getByRole('button', { name: `Remove ${DEFRA}` }).click();
    await expect(addedSources(page)).toHaveText([`${ONS}: Live births`]);

    await page.getByLabel(DEFINITION_FIELD, { exact: true }).fill('Live births in the year.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, NUMERATOR.taskName)).toContainText('Completed');
  });
});
