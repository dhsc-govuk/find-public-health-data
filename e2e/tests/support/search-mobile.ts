import { expect, type Page, type TestInfo, test } from '@playwright/test';

export function mobileFilterTests(scan: (page: Page, testInfo: TestInfo) => Promise<void>) {
  test('tapping a filter header expands and collapses its controls', async ({ page }, testInfo) => {
    await page.goto('/search?q=diabetes');
    await expect(
      page.getByRole('heading', { name: 'Indicator filters', exact: true }),
    ).toBeVisible();
    for (const [title, role, name] of [
      ['Geographies', 'searchbox', 'Search for a geography'],
      ['Topics and types', 'checkbox', 'Diabetes'],
      ['Frameworks and programmes', 'checkbox', 'Public Health Outcomes Framework'],
      ['About the data', 'checkbox', 'Proportion'],
      ['Years the data covers', 'textbox', 'From'],
      ['Last updated', 'combobox', 'Last updated'],
    ] as const) {
      const heading = page
        .getByRole('heading', { name: title, exact: true })
        .filter({ has: page.getByRole('button') });
      const toggle = heading.getByRole('button');
      const control = page.getByRole(role, { name, exact: true });
      if (title === 'Geographies') {
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await heading.tap({ position: { x: 20, y: 20 } });
      }
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await heading.tap({ position: { x: 20, y: 20 } });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(control).toBeVisible();
      await scan(page, testInfo);
      await heading.tap({ position: { x: 20, y: 20 } });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(control).toBeHidden();
    }
  });
}
