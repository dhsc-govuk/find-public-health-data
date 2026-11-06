import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { MORTALITY_PATH } from '../support/indicator-page.ts';

test('loads every mobile section under concurrent traffic and keeps desktop tab changes local', async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const measurements = [];
  for (const [path, sections] of [
    [MORTALITY_PATH, ['indicator-data', 'indicator-compare-areas', 'indicator-inequalities']],
    ['/topics/diabetes', ['topic-data', 'topic-area-summaries']],
  ] as const) {
    const traffic = Promise.all(
      Array.from({ length: 7 }, async () => {
        for (let round = 0; round < 3; round++) {
          const response = await request.get(path, {
            headers: { 'user-agent': 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36' },
          });
          expect(response.status()).toBe(200);
          expect(await response.text()).not.toMatch(/could not be loaded|Server Timeout/);
        }
      }),
    );
    const started = performance.now();
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      for (const id of sections)
        await expect(page.locator(`#${id}`).getByRole('table').first()).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: /^Loading / })).toHaveCount(0);
      measurements.push({ path, fullMobileDataMs: Math.round(performance.now() - started) });
    } finally {
      await traffic;
    }
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
  await testInfo.attach('full-data-under-load', {
    body: JSON.stringify(measurements, null, 2),
    contentType: 'application/json',
  });
});
