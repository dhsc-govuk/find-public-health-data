import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';

// The e2e stack shows 10 search results a page, so the 12 seeded indicators fill two pages.
const results = (page: Page) => page.locator('.fphd-search-results').getByRole('link');
const pages = (page: Page) => page.getByRole('navigation', { name: 'Search results pages' });
// GOV.UK's visually hidden text is padded with a space either side, which lands before the comma.
const pageHeading = (page: Page, current: number) =>
  page.getByRole('heading', {
    level: 2,
    name: new RegExp(`^12 indicators ?, page ${current} of 2$`),
  });

for (const javaScriptEnabled of [true, false]) {
  test.describe(`search pages with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, () => {
    test.use({ javaScriptEnabled });

    test('reaches a result on the second page of results', async ({ page }) => {
      await page.goto('/search');
      if (javaScriptEnabled)
        await expect(page.getByRole('tab', { name: /^Indicators/ })).toBeVisible();
      await expect(results(page)).toHaveCount(10);
      const firstPage = await results(page).allTextContents();

      await pages(page).getByRole('link', { name: /Next/ }).click();

      await expect(page).toHaveURL('/search?page=2');
      const heading = pageHeading(page, 2);
      await expect(heading).toBeVisible();
      if (javaScriptEnabled) await expect(heading).toBeFocused();
      await expect(pages(page).getByRole('link', { name: '2', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(results(page)).toHaveCount(2);
      const secondPage = await results(page).allTextContents();
      expect(secondPage.filter((name) => firstPage.includes(name))).toEqual([]);

      const name = secondPage[0];
      if (name === undefined) throw new Error('The second page has no results');
      await results(page).first().click();
      await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    });
  });
}

test('changing a filter or the keywords returns to the first page', async ({ page }, testInfo) => {
  await page.goto('/search?page=2');
  await expect(page.getByRole('tab', { name: /^Indicators/ })).toBeVisible();
  await expect(results(page)).toHaveCount(2);
  await expectNoAccessibilityViolations(page, testInfo);

  const topics = page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('heading', { name: 'Topics and types', exact: true }) });
  await topics.getByRole('button', { name: 'Topics and types', exact: true }).click();
  await topics.getByRole('checkbox', { name: 'Diabetes', exact: true }).check();
  await expect(page).toHaveURL('/search?t=diabetes');

  await page.goto('/search?page=2');
  await page.getByRole('searchbox', { name: 'Search by keywords' }).fill('mortality');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL('/search?q=mortality');
});

test('a page past the last page of results shows the last page', async ({ page }) => {
  await page.goto('/search?page=9');

  await expect(page).toHaveURL('/search?page=2');
  await expect(pageHeading(page, 2)).toBeVisible();
});
