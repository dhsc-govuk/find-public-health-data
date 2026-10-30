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

  await page.getByRole('link', { name: 'Browse by topics' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Public health topics' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cancer', exact: true })).toBeVisible();
});

test('moves focus to the new page heading when following a link', async ({ page }) => {
  await expectHydrated(page);

  await page.getByRole('link', { name: 'Browse by topics' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Public health topics' })).toBeFocused();
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await expectNoAccessibilityViolations(page, testInfo);
});

test('keeps the homepage and header at the prototype content width', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });

  await expect(page.locator('.govuk-template__container')).toHaveCSS('max-width', '960px');
  await expect(page.locator('.govuk-template__container')).toHaveCSS('width', '960px');
  await expect(page.locator('.govuk-header .govuk-width-container')).toHaveCSS('width', '960px');
});
