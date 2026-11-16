import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { topicPageTests } from '../support/topic-page.ts';

test('shows a topic', async ({ page }) => {
  await page.goto('/topics/health-behaviours');

  await expect(page.getByRole('heading', { level: 1, name: 'Health behaviours' })).toBeVisible();
  await expect(
    page.locator('#topic-overview').getByText('Everyday behaviours that affect health'),
  ).toBeVisible();
});

test('answers a topic that does not exist with the not-found page', async ({ page }) => {
  const response = await page.goto('/topics/no-such-topic');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await page.goto('/topics/health-behaviours');

  await expectNoAccessibilityViolations(page, testInfo);
});

topicPageTests();

for (const javaScriptEnabled of [true, false]) {
  test.describe(`topic sorting with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, () => {
    test.use({ javaScriptEnabled });

    for (const sort of ['recently-updated', 'invalid']) {
      test(`shows the default Data sort for sort=${sort}`, async ({ page }) => {
        await page.goto(`/topics/diabetes?tab-topic=data&render=complete&sort=${sort}`);
        if (javaScriptEnabled)
          await expect(page.getByRole('tab', { name: 'Data', exact: true })).toBeVisible();
        const select = page
          .locator('#topic-data')
          .getByRole('combobox', { name: 'Sort by', exact: true });
        await expect(select).toHaveValue('subtopic-asc');
        await expect(select.locator('option[selected]')).toHaveAttribute('value', 'subtopic-asc');

        await select.selectOption('name-desc');
        if (!javaScriptEnabled)
          await page
            .locator('#topic-data')
            .getByRole('button', { name: 'Sort indicators', exact: true })
            .click();
        await expect(page).toHaveURL(/sort=name-desc/);
        await expect(select).toHaveValue('name-desc');
      });
    }
  });
}
