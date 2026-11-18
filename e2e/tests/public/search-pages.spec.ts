import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';

test('a page past the last page of results shows the last page', async ({ page }, testInfo) => {
  await page.goto('/search?q=mortality&page=9');

  await expect(page).toHaveURL('/search?q=mortality&page=1');
  await expect(page.getByRole('heading', { level: 2, name: /^\d+ indicators?$/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Search results pages' })).toHaveCount(0);
  await expectNoAccessibilityViolations(page, testInfo);
});
