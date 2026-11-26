import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import { openIndicatorPage } from '../support/indicator-page.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { autocompleteInput, chooseOption, pickSuggestion } from '../support/select-autocomplete.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const FORMAT_AND_SOURCES: Section = {
  key: 'format-and-sources',
  taskName: 'Indicator format and sources',
};

const HAS_NUMERATOR_DENOMINATOR = 'Does this indicator have a numerator and denominator?';

const NUMERATOR_PROVIDER = 'Add a data provider for the numerator';
const DENOMINATOR_PROVIDER = 'Add a data provider for the denominator';
const NUMERATOR_DEFINITION = 'Enter the definition of the numerator';
const DENOMINATOR_DEFINITION = 'Enter the definition of the denominator';

const ONS = 'Office for National Statistics (ONS)';
const DEFRA = 'Department for Environment, Food and Rural Affairs (DEFRA)';

function dataValueProvider(number: number) {
  return `Add a data provider (Data value ${number})`;
}

function dataValueDefinition(number: number) {
  return `Enter the definition for this data (Data value ${number})`;
}

/** The radios asking whether disclosure control was applied to a figure. */
function disclosureControl(page: Page, figure: string, nth = 0) {
  return page
    .getByRole('group', { name: `Has disclosure control been applied to ${figure}?` })
    .nth(nth);
}

function answer(page: Page, choice: 'Yes' | 'No') {
  return page
    .getByRole('group', { name: HAS_NUMERATOR_DENOMINATOR })
    .getByLabel(choice, { exact: true })
    .first();
}

/** The source select offering the sources of the provider named `providerName`. */
function sourceField(page: Page, providerName: string) {
  return page.getByLabel(`Add the specific source from ${providerName}`);
}

/** Picks a provider, then one of its sources from the suggestions, which adds it at once. */
async function pickSource(page: Page, providerLabel: string, provider: string, source: string) {
  await chooseOption(page, providerLabel, provider);
  await pickSuggestion(page, `Add the specific source from ${provider}`, source);
}

/** The text of each source added, in the order the lists show them. */
function addedSources(page: Page) {
  return page.getByRole('main').locator('.fphd-added-list__item > span');
}

async function addSource(page: Page, providerLabel: string, provider: string, source: string) {
  await pickSource(page, providerLabel, provider, source);
  const added = source === 'No specific source' ? provider : `${provider}: ${source}`;
  await expect(addedSources(page).filter({ hasText: added })).not.toHaveCount(0);
}

/** Answers the numerator and denominator in full, disclosure control applied to the numerator. */
async function answerNumeratorAndDenominator(page: Page) {
  await answer(page, 'Yes').check();
  await addSource(page, NUMERATOR_PROVIDER, ONS, 'Live births');
  await page.getByLabel(NUMERATOR_DEFINITION, { exact: true }).fill('Live births in the year.');
  await disclosureControl(page, 'the numerator').getByLabel('Yes', { exact: true }).check();
  await disclosureControl(page, 'the numerator')
    .getByLabel('Provide details')
    .fill('Counts under 5 are suppressed.');
  await addSource(page, DENOMINATOR_PROVIDER, ONS, 'Mid-year population estimates');
  await page.getByLabel(DENOMINATOR_DEFINITION, { exact: true }).fill('Resident population.');
  await disclosureControl(page, 'the denominator')
    .getByLabel('Not applicable', { exact: true })
    .check();
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(FORMAT_AND_SOURCES, {
  expectUnanswered: async (page) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Indicator format and sources' }),
    ).toBeVisible();
    await expect(answer(page, 'Yes')).not.toBeChecked();
    await expect(answer(page, 'No')).not.toBeChecked();
  },
  refusal: {
    messages: ['Select whether this indicator has a numerator and denominator'],
    focuses: (page) => answer(page, 'Yes'),
  },
});

test('asks whether the indicator has a numerator and denominator, with the guidance link under the heading', async ({
  page,
}) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);

  await expect(
    page.getByRole('link', { name: /^Related guidance for this section/ }),
  ).toHaveAttribute('href', '/publish/guidance#numerator');
  await expect(page.getByRole('group', { name: HAS_NUMERATOR_DENOMINATOR })).toBeVisible();
  await expect(page.getByLabel(NUMERATOR_PROVIDER, { exact: true })).toBeHidden();
  await expect(page.getByLabel(dataValueDefinition(1), { exact: true })).toBeHidden();
});

test('Yes shows the numerator and denominator sources, definitions and disclosure control', async ({
  page,
}) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);

  await answer(page, 'Yes').check();

  await expect(page.getByLabel(NUMERATOR_DEFINITION, { exact: true })).toBeVisible();
  await expect(page.getByLabel(DENOMINATOR_DEFINITION, { exact: true })).toBeVisible();
  for (const figure of ['the numerator', 'the denominator']) {
    await expect(disclosureControl(page, figure).getByRole('radio')).toHaveCount(2);
    await expect(disclosureControl(page, figure).getByLabel('Not applicable')).toBeVisible();
  }
  await expect(
    page.getByText(
      'If you cannot find a provider in the list, you can request a data provider be added.',
    ),
  ).toHaveCount(3);
});

test("offers a provider's sources once the provider is chosen", async ({ page }) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);
  await answer(page, 'Yes').check();

  await chooseOption(page, NUMERATOR_PROVIDER, ONS);

  const source = autocompleteInput(page, `Add the specific source from ${ONS}`);
  await expect(source).toBeVisible();
  // Picking a source adds it, so the button that adds one is for browsers without JavaScript.
  await expect(page.getByRole('button', { name: 'Add source' })).toHaveCount(0);
  await source.click();
  const suggestions = page.getByRole('listbox').getByRole('option');
  await expect(suggestions.first()).toHaveText('No specific source');
  await expect(suggestions.filter({ hasText: /^Live births$/ })).toHaveCount(1);
});

test('adds and removes each source, to its own figure only', async ({ page }) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);
  await answer(page, 'Yes').check();

  await addSource(page, NUMERATOR_PROVIDER, ONS, 'Live births');
  await addSource(page, NUMERATOR_PROVIDER, DEFRA, 'No specific source');
  await addSource(page, DENOMINATOR_PROVIDER, ONS, 'Mid-year population estimates');
  await expect(addedSources(page)).toHaveText([
    `${ONS}: Live births`,
    DEFRA,
    `${ONS}: Mid-year population estimates`,
  ]);

  await page.getByRole('button', { name: `Remove ${ONS}: Live births` }).click();

  await expect(addedSources(page)).toHaveText([DEFRA, `${ONS}: Mid-year population estimates`]);
});

test('refuses a provider and source already added', async ({ page }) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);
  await answer(page, 'Yes').check();
  await addSource(page, NUMERATOR_PROVIDER, ONS, 'Live births');

  await pickSource(page, NUMERATOR_PROVIDER, ONS, 'Live births');

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Select a source that has not already been added',
  ]);
  await expect(addedSources(page)).toHaveText([`${ONS}: Live births`]);
});

test('asks for every answer about the numerator and denominator beside Yes', async ({ page }) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);
  await answer(page, 'Yes').check();
  await disclosureControl(page, 'the denominator').getByLabel('Yes', { exact: true }).check();

  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([
    'Add at least one data source for the numerator',
    'Enter the numerator definition',
    'Select whether disclosure control has been applied to the numerator',
    'Add at least one data source for the denominator',
    'Enter the denominator definition',
    'Provide details of the disclosure control applied to the denominator',
  ]);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: 'Enter the numerator definition' }).click();
  await expect(page.getByLabel(NUMERATOR_DEFINITION, { exact: true })).toBeFocused();
});

test('saves the numerator and denominator on Continue and shows the task as completed', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, FORMAT_AND_SOURCES);
  await answerNumeratorAndDenominator(page);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, FORMAT_AND_SOURCES.taskName)).toContainText('Completed');

  await taskRow(page, FORMAT_AND_SOURCES.taskName).getByRole('link').click();
  await expect(answer(page, 'Yes')).toBeChecked();
  await expect(addedSources(page)).toHaveText([
    `${ONS}: Live births`,
    `${ONS}: Mid-year population estimates`,
  ]);
  await expect(disclosureControl(page, 'the numerator').getByLabel('Provide details')).toHaveValue(
    'Counts under 5 are suppressed.',
  );
});

test('No shows a data value, and adds and removes others', async ({ page }) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);

  await answer(page, 'No').check();
  await expect(page.getByLabel(dataValueDefinition(1), { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove data value/ })).toHaveCount(0);

  await page.getByLabel(dataValueDefinition(1), { exact: true }).fill('Hospital admissions.');
  await page.getByRole('button', { name: 'Add another data value' }).click();
  await page.getByLabel(dataValueDefinition(2), { exact: true }).fill('Discharges.');
  await page.getByRole('button', { name: 'Add another data value' }).click();
  await expect(page.getByLabel(dataValueDefinition(3), { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Remove data value 1' }).click();

  await expect(page.getByLabel(dataValueDefinition(1), { exact: true })).toHaveValue('Discharges.');
  await expect(page.getByLabel(dataValueDefinition(3), { exact: true })).toHaveCount(0);
});

test('asks for every answer about each data value, naming it', async ({ page }) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);
  await answer(page, 'No').check();
  await page.getByRole('button', { name: 'Add another data value' }).click();
  await addSource(page, dataValueProvider(1), ONS, 'Live births');
  await page.getByLabel(dataValueDefinition(1), { exact: true }).fill('Live births.');
  await disclosureControl(page, 'this data value', 0)
    .getByLabel('Not applicable', { exact: true })
    .check();

  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([
    'Add at least one data source for data value 2',
    'Enter the definition for data value 2',
    'Select whether disclosure control has been applied to data value 2',
  ]);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: 'Enter the definition for data value 2' }).click();
  await expect(page.getByLabel(dataValueDefinition(2), { exact: true })).toBeFocused();
});

test('saves the data values on Continue, each with its own sources', async ({ page }) => {
  const taskListPath = await openSectionPage(page, FORMAT_AND_SOURCES);
  await answer(page, 'No').check();
  await addSource(page, dataValueProvider(1), ONS, 'Live births');
  await page.getByLabel(dataValueDefinition(1), { exact: true }).fill('Live births.');
  await disclosureControl(page, 'this data value', 0)
    .getByLabel('Not applicable', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Add another data value' }).click();
  await addSource(page, dataValueProvider(2), DEFRA, 'No specific source');
  await page.getByLabel(dataValueDefinition(2), { exact: true }).fill('Households.');
  await disclosureControl(page, 'this data value', 1).getByLabel('Yes', { exact: true }).check();
  await disclosureControl(page, 'this data value', 1)
    .getByLabel('Provide details')
    .fill('Rounded to the nearest 5.');

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, FORMAT_AND_SOURCES.taskName)).toContainText('Completed');

  await taskRow(page, FORMAT_AND_SOURCES.taskName).getByRole('link').click();
  await expect(answer(page, 'No')).toBeChecked();
  await expect(addedSources(page)).toHaveText([`${ONS}: Live births`, DEFRA]);
  await expect(page.getByLabel(dataValueDefinition(2), { exact: true })).toHaveValue('Households.');
});

test('shows each data value with its sources, definition and disclosure control on the preview', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, FORMAT_AND_SOURCES);
  await answer(page, 'No').check();
  await addSource(page, dataValueProvider(1), ONS, 'Live births');
  await page.getByLabel(dataValueDefinition(1), { exact: true }).fill('Live births.');
  await disclosureControl(page, 'this data value', 0).getByLabel('Yes', { exact: true }).check();
  await disclosureControl(page, 'this data value', 0)
    .getByLabel('Provide details')
    .fill('Counts under 5 are suppressed.');
  await page.getByRole('button', { name: 'Add another data value' }).click();
  await addSource(page, dataValueProvider(2), DEFRA, 'No specific source');
  await page.getByLabel(dataValueDefinition(2), { exact: true }).fill('Households.');
  await disclosureControl(page, 'this data value', 1)
    .getByLabel('Not applicable', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);

  const id = taskListPath.split('/')[3] ?? '';
  await openIndicatorPage(page, `/dashboard/indicators/${id}/preview`);
  await page.getByRole('tab', { name: 'About this indicator', exact: true }).click();
  const about = page.getByRole('tabpanel', { name: 'About this indicator' });

  await expect(about.getByRole('heading', { name: 'Data value 1', exact: true })).toBeVisible();
  await expect(about.getByRole('heading', { name: 'Data value 2', exact: true })).toBeVisible();
  await expect(about.getByRole('heading', { name: 'Numerator', exact: true })).toHaveCount(0);
  await expect(about).toContainText(`${ONS}: Live births`);
  await expect(about).toContainText('Households.');
  await expect(about).toContainText('Counts under 5 are suppressed.');
});

test('saves nothing until Continue is selected', async ({ page }) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);
  const pagePath = new URL(page.url()).pathname;
  await answer(page, 'Yes').check();
  await addSource(page, NUMERATOR_PROVIDER, ONS, 'Live births');

  await page.goto(pagePath);

  await expect(addedSources(page)).toHaveCount(0);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations with the numerator and denominator answered and refused', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);
  await answer(page, 'Yes').check();
  await addSource(page, NUMERATOR_PROVIDER, ONS, 'Live births');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter the numerator definition');

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations with two data values', async ({ page }, testInfo) => {
  await openSectionPage(page, FORMAT_AND_SOURCES);
  await answer(page, 'No').check();
  await page.getByRole('button', { name: 'Add another data value' }).click();
  await expect(page.getByLabel(dataValueDefinition(2), { exact: true })).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test("shows a provider's sources, adds and removes them, then saves them", async ({ page }) => {
    const taskListPath = await openSectionPage(page, FORMAT_AND_SOURCES);
    const showSources = page.getByRole('button', { name: 'Show sources' });
    const addSourceButton = page.getByRole('button', { name: 'Add source' });

    await answer(page, 'Yes').check();
    await page.getByLabel(NUMERATOR_PROVIDER, { exact: true }).selectOption({ label: ONS });
    await showSources.first().click();
    await sourceField(page, ONS).first().selectOption({ label: 'Live births' });
    await addSourceButton.first().click();

    await page.getByLabel(NUMERATOR_PROVIDER, { exact: true }).selectOption({ label: DEFRA });
    await showSources.first().click();
    await sourceField(page, DEFRA).first().selectOption({ label: 'No specific source' });
    await addSourceButton.first().click();
    await expect(addedSources(page)).toHaveText([`${ONS}: Live births`, DEFRA]);

    await page.getByRole('button', { name: `Remove ${DEFRA}` }).click();
    await expect(addedSources(page)).toHaveText([`${ONS}: Live births`]);

    await page.getByLabel(NUMERATOR_DEFINITION, { exact: true }).fill('Live births in the year.');
    await disclosureControl(page, 'the numerator')
      .getByLabel('Not applicable', { exact: true })
      .check();
    await page.getByLabel(DENOMINATOR_PROVIDER, { exact: true }).selectOption({ label: ONS });
    await showSources.nth(1).click();
    await sourceField(page, ONS).first().selectOption({ label: 'Mid-year population estimates' });
    await addSourceButton.first().click();
    await page.getByLabel(DENOMINATOR_DEFINITION, { exact: true }).fill('Resident population.');
    await disclosureControl(page, 'the denominator')
      .getByLabel('Not applicable', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, FORMAT_AND_SOURCES.taskName)).toContainText('Completed');
  });

  test('adds and removes data values', async ({ page }) => {
    await openSectionPage(page, FORMAT_AND_SOURCES);

    await page.getByLabel(dataValueDefinition(1), { exact: true }).fill('Admissions.');
    await page.getByRole('button', { name: 'Add another data value' }).click();

    await expect(answer(page, 'No')).toBeChecked();
    await expect(page.getByLabel(dataValueDefinition(1), { exact: true })).toHaveValue(
      'Admissions.',
    );
    await page.getByLabel(dataValueDefinition(2), { exact: true }).fill('Population.');

    await page.getByRole('button', { name: 'Remove data value 1' }).click();

    await expect(page.getByLabel(dataValueDefinition(1), { exact: true })).toHaveValue(
      'Population.',
    );
    await expect(page.getByLabel(dataValueDefinition(2), { exact: true })).toHaveCount(0);
  });
});
