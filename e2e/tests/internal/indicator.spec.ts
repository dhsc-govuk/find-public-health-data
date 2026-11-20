import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { MORTALITY_PATH } from '../support/indicator-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

test.use({ storageState: PUBLISHER.storageState });

test.beforeEach(async ({ page }) => {
  await page.goto(MORTALITY_PATH);
});

test('shows an indicator to a publisher', async ({ page }) => {
  await expect(
    page.getByRole('heading', { level: 1, name: 'Under 75 mortality rate from all causes' }),
  ).toBeVisible();
});

test("loads the Compare areas tab's regions on internal-web", async ({ page }) => {
  // The lookup answers 200 even when its API calls fail, with null in their place.
  const lookup = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/compare-areas' &&
      new URL(response.url()).searchParams.get('parents') === '1',
  );
  await page.getByRole('tab', { name: 'Compare areas', exact: true }).click();
  const response = await lookup;
  expect(response.status()).toBe(200);
  expect((await response.json()).parents).not.toBeNull();
  await expect(
    page
      .getByRole('tabpanel', { name: 'Compare areas' })
      .getByRole('checkbox', { name: /^North East: all \d+ upper tier local authorities$/ }),
  ).toBeVisible();
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await expectNoAccessibilityViolations(page, testInfo);
});
