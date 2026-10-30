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

const SECTION: Section = { key: 'links', taskName: 'Links' };
const QUESTION = 'Are there any relevant links to help users understand this indicator better?';
const URL_FIELD = 'Add link URL';
const TEXT_FIELD = 'Add link text';

const COMMENTARY = { url: 'https://www.gov.uk/statistics', text: 'Statistical commentary' };
const FINGERTIPS = { url: 'https://fingertips.phe.org.uk/', text: 'Fingertips' };

async function addLink(page: Page, { text, url }: { url: string; text: string }) {
  await page.getByLabel(URL_FIELD, { exact: true }).fill(url);
  await page.getByLabel(TEXT_FIELD, { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Add link' }).click();
  await expect(page.getByRole('link', { name: `${text} (opens in new tab)` })).toBeVisible();
}

function addedLinks(page: Page) {
  return page.getByRole('main').getByRole('listitem').getByRole('link');
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(page.getByRole('heading', { level: 1, name: QUESTION })).toBeVisible();
    await expect(page.getByLabel('Yes', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('No', { exact: true })).not.toBeChecked();
  },
  refusal: {
    messages: ['Select whether there are any relevant links'],
    focuses: (page) => page.getByLabel('Yes', { exact: true }),
  },
});

test('reveals the link fields only while "Yes" is chosen', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await expect(page.getByLabel(URL_FIELD, { exact: true })).toBeHidden();

  await page.getByLabel('Yes', { exact: true }).check();
  await expect(page.getByLabel(URL_FIELD, { exact: true })).toBeVisible();
  await expect(page.getByLabel(TEXT_FIELD, { exact: true })).toBeVisible();

  await page.getByLabel('No', { exact: true }).check();
  await expect(page.getByLabel(URL_FIELD, { exact: true })).toBeHidden();
});

test('adds links to a list, in the order they were added, clearing the fields', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);
  await page.getByLabel('Yes', { exact: true }).check();

  await addLink(page, COMMENTARY);
  await addLink(page, FINGERTIPS);

  await expect(addedLinks(page)).toHaveText([
    'Statistical commentary (opens in new tab)',
    'Fingertips (opens in new tab)',
  ]);
  await expect(addedLinks(page).first()).toHaveAttribute('href', COMMENTARY.url);
  await expect(page.getByLabel(URL_FIELD, { exact: true })).toBeEmpty();
  await expect(page.getByLabel(TEXT_FIELD, { exact: true })).toBeEmpty();
});

test('refuses a save of links someone else changed while links were being added', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await page.getByLabel('Yes', { exact: true }).check();
  await addLink(page, COMMENTARY);
  const other = await page.context().newPage();
  await other.goto(pagePath);
  await other.getByLabel('No', { exact: true }).check();
  await other.getByRole('button', { name: 'Continue' }).click();
  await expect(other).toHaveURL(taskListPath);

  await addLink(page, FINGERTIPS);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Someone else has changed this section since you opened this page.',
  );
  await expect(addedLinks(page)).toHaveText([
    'Statistical commentary (opens in new tab)',
    'Fingertips (opens in new tab)',
  ]);
});

test('continues when Enter is pressed on "No", rather than adding a link', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  await page.getByLabel('No', { exact: true }).check();

  await page.getByLabel('No', { exact: true }).press('Enter');

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
});

test('continues when Enter is pressed in a field, saving the typed link', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  await page.getByLabel('Yes', { exact: true }).check();
  await addLink(page, COMMENTARY);

  await page.getByLabel(URL_FIELD, { exact: true }).fill(FINGERTIPS.url);
  await page.getByLabel(TEXT_FIELD, { exact: true }).fill(FINGERTIPS.text);
  await page.getByLabel(TEXT_FIELD, { exact: true }).press('Enter');

  await expect(page).toHaveURL(taskListPath);
  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(addedLinks(page)).toHaveText([
    'Statistical commentary (opens in new tab)',
    'Fingertips (opens in new tab)',
  ]);
});

test('removes a link from the list', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await page.getByLabel('Yes', { exact: true }).check();
  await addLink(page, COMMENTARY);
  await addLink(page, FINGERTIPS);

  await page.getByRole('button', { name: 'Remove link Statistical commentary' }).click();

  await expect(addedLinks(page)).toHaveText(['Fingertips (opens in new tab)']);
});

test('asks for a URL and link text when Add link is selected with them empty', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await page.getByLabel('Yes', { exact: true }).check();

  await page.getByRole('button', { name: 'Add link' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Enter a URL', 'Enter link text']);
  await expect(page.getByLabel('Yes', { exact: true })).toBeChecked();

  await expectErrorSummaryReady(page);
  await summary.getByRole('link', { name: 'Enter link text' }).click();
  await expect(page.getByLabel(TEXT_FIELD, { exact: true })).toBeFocused();
});

test('refuses a URL that is not an absolute web address, keeping what was typed', async ({
  page,
}) => {
  await openSectionPage(page, SECTION);
  await page.getByLabel('Yes', { exact: true }).check();

  await page.getByLabel(URL_FIELD, { exact: true }).fill('www.gov.uk');
  await page.getByLabel(TEXT_FIELD, { exact: true }).fill('GOV.UK');
  await page.getByRole('button', { name: 'Add link' }).click();

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Enter a URL in the correct format, like https://www.gov.uk',
  ]);
  await expect(page.getByLabel(URL_FIELD, { exact: true })).toHaveValue('www.gov.uk');
  await expect(page.getByLabel(TEXT_FIELD, { exact: true })).toHaveValue('GOV.UK');
});

test('asks for a link when "Yes" is chosen without one', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await page.getByLabel('Yes', { exact: true }).check();

  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Add at least one link']);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(page.getByLabel(URL_FIELD, { exact: true })).toBeFocused();
});

test('saves nothing until Continue is selected', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await page.getByLabel('Yes', { exact: true }).check();
  await addLink(page, COMMENTARY);

  await page.goto(pagePath);

  await expect(page.getByLabel('Yes', { exact: true })).not.toBeChecked();
  await expect(addedLinks(page)).toHaveCount(0);
});

test('saves the links on Continue and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  await page.getByLabel('Yes', { exact: true }).check();
  await addLink(page, COMMENTARY);
  await addLink(page, FINGERTIPS);
  await page.getByRole('button', { name: 'Remove link Statistical commentary' }).click();
  await addLink(page, COMMENTARY);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(page.getByLabel('Yes', { exact: true })).toBeChecked();
  await expect(addedLinks(page)).toHaveText([
    'Fingertips (opens in new tab)',
    'Statistical commentary (opens in new tab)',
  ]);
});

test('saves a link typed but not added when Continue is selected', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  await page.getByLabel('Yes', { exact: true }).check();
  await page.getByLabel(URL_FIELD, { exact: true }).fill(COMMENTARY.url);
  await page.getByLabel(TEXT_FIELD, { exact: true }).fill(COMMENTARY.text);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expect(addedLinks(page)).toHaveText(['Statistical commentary (opens in new tab)']);
});

test('saves "No" and forgets any links saved before', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await page.getByLabel('Yes', { exact: true }).check();
  await addLink(page, COMMENTARY);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath);

  await page.goto(pagePath);
  await page.getByLabel('No', { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(page.getByLabel('No', { exact: true })).toBeChecked();
  await page.getByLabel('Yes', { exact: true }).check();
  await expect(addedLinks(page)).toHaveCount(0);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations with links added and a link refused', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, SECTION);
  await page.getByLabel('Yes', { exact: true }).check();
  await addLink(page, COMMENTARY);
  await addLink(page, FINGERTIPS);
  await page.getByRole('button', { name: 'Add link' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a URL');

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('adds and removes links, then saves them', async ({ page }) => {
    const taskListPath = await openSectionPage(page, SECTION);

    await expect(page.getByLabel(URL_FIELD, { exact: true })).toBeVisible();

    await page.getByLabel('Yes', { exact: true }).check();
    await addLink(page, COMMENTARY);
    await addLink(page, FINGERTIPS);
    await page.getByRole('button', { name: 'Remove link Fingertips' }).click();
    await expect(addedLinks(page)).toHaveText(['Statistical commentary (opens in new tab)']);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  });
});
