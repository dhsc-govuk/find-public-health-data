import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { followShownLink, INVITEE_EMAIL, NO_ACCESS, requestLink } from '../support/private-beta.ts';

test.describe('without access', () => {
  test.use({ storageState: NO_ACCESS });

  test('sends a visitor to the private beta page, and the link back to where they were going', async ({
    page,
  }) => {
    await page.goto('/topics?page=1');
    await expect(page).toHaveURL('/private-beta?returnTo=%2Ftopics%3Fpage%3D1');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to the private beta' }),
    ).toBeVisible();

    await requestLink(page, INVITEE_EMAIL);
    await followShownLink(page);

    await expect(page).toHaveURL('/topics?page=1');
    await expect(page.getByRole('heading', { level: 1, name: 'Topics' })).toBeVisible();
  });

  test('answers an address that was not invited the same way, with no link', async ({ page }) => {
    await page.goto('/private-beta');
    await requestLink(page, 'not-invited@example.com');

    await expect(page.getByText('not-invited@example.com')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
  });

  test('asks for an address in the correct format', async ({ page }) => {
    await page.goto('/private-beta');
    await page.getByLabel('Email address').fill('developer');
    await page.getByRole('button', { name: 'Send sign-in link' }).click();

    await expect(page).toHaveTitle(/^Error: /);
    await expect(page.getByRole('alert')).toContainText(
      'Enter an email address in the correct format, like name@example.com',
    );
  });

  test('sends a link that is not valid back to ask for another', async ({ page }) => {
    await page.goto('/private-beta/sign-in?token=not-a-token&returnTo=%2Ftopics');

    await expect(page).toHaveURL('/private-beta?link=rejected&returnTo=%2Ftopics');
    await expect(page.getByText('That sign-in link has expired or is not valid.')).toBeVisible();
  });

  test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
    await page.goto('/private-beta?link=rejected');
    await expectNoAccessibilityViolations(page, testInfo);

    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    await expect(page.getByRole('alert')).toContainText('Enter your email address');
    await expectNoAccessibilityViolations(page, testInfo);

    await requestLink(page, INVITEE_EMAIL);
    await expectNoAccessibilityViolations(page, testInfo);
  });
});
