import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { submitNewIndicator } from '../support/complete-draft.ts';
import { uniqueIndicatorName } from '../support/create-indicator.ts';
import { ADMIN, PUBLISHER } from '../support/sign-in.ts';

// The decision itself needs a live indicator, which only publication gives, so its journey is in
// the publishing project's indicator-update.spec.ts. These cover what the pages answer otherwise.

test.describe('as an admin', () => {
  test.use({ storageState: ADMIN.storageState });

  test('the update decision pages send an admin to the overview for a new indicator, which has no update to decide on', async ({
    browser,
    page,
  }, testInfo) => {
    const id = await submitNewIndicator(browser, uniqueIndicatorName('no update to decide'));

    for (const path of ['update-decision', 'update-decision/revisions?submission=1']) {
      await page.goto(`/dashboard/indicators/${id}/${path}`);

      await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
      await expect(
        page.getByText('This update is no longer waiting for a decision.'),
      ).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Submit update decision' })).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);
  });
});

test.describe('as a publisher', () => {
  test.use({ storageState: PUBLISHER.storageState });

  test('the update decision pages do not exist for a publisher', async ({ browser, page }) => {
    const id = await submitNewIndicator(browser, uniqueIndicatorName('not a decider'));

    await page.goto(`/dashboard/indicators/${id}/update-decision`);

    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});
