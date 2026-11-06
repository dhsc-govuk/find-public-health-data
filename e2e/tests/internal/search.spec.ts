import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { PUBLISHER } from '../support/sign-in.ts';

test.use({ storageState: PUBLISHER.storageState });

test.beforeEach(async ({ page }) => {
  await page.goto('/search');
});

test('shows the search page to a publisher', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Search for data' })).toBeVisible();
});

test('staff can select and look up local authorities in the internal geography scheme', async ({
  page,
}, testInfo) => {
  const group = page.getByRole('checkbox', {
    name: 'All Local authorities (as one group)',
    exact: true,
  });
  await expect(group).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search for a geography' }).fill('County Durham');
  await expect(page.getByRole('checkbox', { name: 'County Durham', exact: true })).toBeVisible();
  await expect(group).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await page.getByRole('heading', { level: 1, name: 'Search for data' }).waitFor();
  await expectNoAccessibilityViolations(page, testInfo);
});
