import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectHydrated } from '../support/govuk-frontend.ts';
import { openSectionPage } from '../support/section-page.ts';
import { IMRG_REVIEWER, PUBLISHER } from '../support/sign-in.ts';

const GUIDANCE_LINK = 'Related guidance for this section (opens in new tab)';

test.describe('as a publisher', () => {
  test.use({ storageState: PUBLISHER.storageState });

  test('shows a publisher the guidance, with its contents', async ({ page }) => {
    await page.goto('/publish/guidance');
    await expectHydrated(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Publisher guidance' })).toBeVisible();
    const contents = page.getByRole('navigation', { name: 'Contents' });
    await contents.getByRole('link', { name: 'Formatting text with markdown' }).click();
    await expect(page).toHaveURL('/publish/guidance#markdown');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Formatting text with markdown' }),
    ).toBeInViewport();
  });

  test('links a section page to its part of the guidance, which opens in a new tab', async ({
    page,
  }) => {
    await openSectionPage(page, {
      key: 'definition-and-rationale',
      taskName: 'Definition and rationale',
    });
    await expectHydrated(page);

    const [guidance] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('link', { name: GUIDANCE_LINK }).click(),
    ]);

    await expect(guidance).toHaveURL('/publish/guidance#definition');
    await expect(
      guidance.getByRole('rowheader', { name: 'Definition', exact: true }),
    ).toBeInViewport();
    // The section page stays open in its own tab.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Definition and rationale' }),
    ).toBeVisible();
  });

  test('shows no hint on the Name page, which links to the guidance on names', async ({ page }) => {
    await page.goto('/publish/indicators/new');

    await expect(
      page.getByRole('heading', { level: 1, name: 'What is the name of the indicator?' }),
    ).toBeVisible();
    await expect(
      page.getByText('The name should be unique, descriptive and written in plain English.'),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: GUIDANCE_LINK })).toHaveAttribute(
      'href',
      '/publish/guidance#name',
    );
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
