import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectHydrated } from '../support/govuk-frontend.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// Proof of life for public-web: the home page serves, and following it to /topics renders
// core data — the SSR path down to Postgres is live.
test('serves the home page and renders core-data topics', async ({ page }) => {
  await expect(
    page.getByRole('heading', { level: 1, name: 'Find public health data' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Browse by topic', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Public health topics' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cancer', exact: true })).toBeVisible();
});

test('moves focus to the new page heading when following a link', async ({ page }) => {
  await expectHydrated(page);

  await page.getByRole('link', { name: 'Browse by topic', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Public health topics' })).toBeFocused();
});

test('orders the home page as the latest prototype does', async ({ page }) => {
  await expect(
    page
      .getByRole('main')
      .locator(
        'h1, .govuk-body-l, .govuk-inset-text, .govuk-label--m, .govuk-hint, h2, .fphd-card-list__link',
      ),
  ).toHaveText([
    'Find public health data',
    /^Search and browse public health data for England\./,
    'This service was previously known as Fingertips.',
    'Search for data',
    'For example, diabetes or mental health',
    'Ways to find data',
    'Browse by topic',
    'Browse all data',
    'Public health data',
    'Using this service',
  ]);
});

test('does not show the geography, framework or programme, or recently updated cards yet', async ({
  page,
}) => {
  const cards = page.getByRole('main').getByRole('listitem').getByRole('link');

  await expect(cards).toHaveText(['Browse by topic', 'Browse all data']);
  await expect(cards.nth(0)).toHaveAttribute('href', '/topics');
  await expect(cards.nth(1)).toHaveAttribute('href', '/search');
});

test('searches for data from the home page', async ({ page }) => {
  await page.getByLabel('Search for data').fill('diabetes');
  await page.getByLabel('Search for data').press('Enter');

  await expect(page).toHaveURL(/\/search\?q=diabetes$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Search for data' })).toBeVisible();
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await expectNoAccessibilityViolations(page, testInfo);
});

test('keeps the homepage and header at the prototype content width', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });

  await expect(page.locator('.govuk-template__container')).toHaveCSS('max-width', '1020px');
  await expect(page.locator('.govuk-template__container')).toHaveCSS('width', '1020px');
  await expect(page.locator('.govuk-header .govuk-width-container')).toHaveCSS('width', '1020px');
});

test('links the footer only to GDS, the Open Government Licence and Crown copyright', async ({
  page,
}) => {
  await expect(page.getByRole('contentinfo').getByRole('link')).toHaveText([
    'Government Digital Service',
    'Open Government Licence v3.0',
    '© Crown copyright',
  ]);
});
