import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { MORTALITY_PATH } from '../support/indicator-page.ts';

test('loads every mobile section and keeps desktop tab changes local', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, sections] of [
    [MORTALITY_PATH, ['indicator-data', 'indicator-compare-areas', 'indicator-inequalities']],
    ['/topics/diabetes', ['topic-data', 'topic-area-summaries']],
  ] as const) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    for (const id of sections)
      await expect(page.locator(`#${id}`).getByRole('table').first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /^Loading / })).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('tablist')).toBeVisible();
    const reads: string[] = [];
    page.on('request', (incoming) => {
      if (incoming.url().includes('.data')) reads.push(incoming.url());
    });
    for (const tab of await page.getByRole('tab').all()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
    expect(reads).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
  }
});
