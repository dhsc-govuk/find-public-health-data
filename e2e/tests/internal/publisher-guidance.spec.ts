import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { IMRG_REVIEWER, PUBLISHER } from '../support/sign-in.ts';

test.describe('as a publisher', () => {
  test.use({ storageState: PUBLISHER.storageState });

  test('shows a publisher the guidance, with its contents', async ({ page }) => {
    await page.goto('/publish/guidance');

    await expect(page.getByRole('heading', { level: 1, name: 'Publisher guidance' })).toBeVisible();
    const contents = page.getByRole('navigation', { name: 'Contents' });
    await contents.getByRole('link', { name: 'Formatting text with markdown' }).click();
    await expect(page).toHaveURL('/publish/guidance#markdown');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Formatting text with markdown' }),
    ).toBeInViewport();
  });

  test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
    await page.goto('/publish/guidance');
    await expect(page.getByRole('heading', { level: 1, name: 'Publisher guidance' })).toBeVisible();

    await expectNoAccessibilityViolations(page, testInfo);
  });
});

test.describe('as a reviewer who does not publish', () => {
  test.use({ storageState: IMRG_REVIEWER.storageState });

  test('turns the reviewer away from the guidance', async ({ page }) => {
    const response = await page.goto('/publish/guidance');

    await expect(page).toHaveURL('/access-denied');
    expect(response?.status()).toBe(403);
  });
});
