import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { ADMIN, PUBLISHER, submitSignIn } from '../support/sign-in.ts';

test.describe('signed out', () => {
  test('offers to sign in to manage indicators', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to manage indicators' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Menu' }).getByRole('link')).toHaveText([
      'Sign in',
    ]);

    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('lands a visitor here from the page they wanted, and returns them to it once signed in', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/?returnTo=%2Fdashboard');

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/sign-in?returnTo=%2Fdashboard');

    await submitSignIn(page, 'Sam Taylor');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Indicators' })).toBeVisible();
  });

  // A click is a client-side navigation, which asks the server for the page's data rather than
  // the page; the return address must still be the page.
  test('returns a visitor to the page they clicked through to', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Find public health data' }).click();
    await expect(page).toHaveURL('/?returnTo=%2Fdashboard');

    await page.getByRole('button', { name: 'Sign in' }).click();
    await submitSignIn(page, 'Sam Taylor');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Indicators' })).toBeVisible();
  });

  test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
    await page.goto('/');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  // Wider than the public app's 960px, for the internal app's tables and forms.
  test('frames the page and header at the internal content width', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');

    await expect(page.locator('.govuk-template__container')).toHaveCSS('max-width', '1280px');
    await expect(page.locator('.govuk-template__container')).toHaveCSS('width', '1280px');
    await expect(page.locator('.govuk-header .govuk-width-container')).toHaveCSS('width', '1280px');
  });
});

test.describe('as a publisher', () => {
  test.use({ storageState: PUBLISHER.storageState });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('lands on the dashboard', async ({ page }) => {
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Indicators' })).toBeVisible();
  });

  test('links the service name straight to the dashboard', async ({ page }) => {
    await page.goto('/search');
    const serviceLink = page.getByRole('link', { name: 'Find public health data' });

    await expect(serviceLink).toHaveAttribute('href', '/dashboard');
    await serviceLink.click();

    await expect(page).toHaveURL('/dashboard');
  });

  test('hides the manage link', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Menu' });

    await expect(navigation.getByRole('link')).toHaveText(['Account']);
  });
});

test.describe('as an admin', () => {
  test.use({ storageState: ADMIN.storageState });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('lands on the dashboard', async ({ page }) => {
    await expect(page).toHaveURL('/dashboard');
  });

  test('offers the manage link as well', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Menu' });

    await expect(navigation.getByRole('link')).toHaveText(['Manage', 'Account']);

    await navigation.getByRole('link', { name: 'Manage' }).click();

    await expect(page).toHaveURL('/manage');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Manage public health data' }),
    ).toBeVisible();
  });
});
