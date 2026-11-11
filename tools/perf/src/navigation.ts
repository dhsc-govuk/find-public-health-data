import { chromium, expect } from '@playwright/test';

export async function openNavigationBrowser() {
  return chromium.launch();
}

export type NavigationBrowser = Awaited<ReturnType<typeof openNavigationBrowser>>;

export async function measureNavigation(browser: NavigationBrowser, url: URL) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const started = performance.now();
  try {
    const sections = url.pathname.startsWith('/indicator/')
      ? ['indicator-data', 'indicator-compare-areas', 'indicator-inequalities']
      : ['topic-data', 'topic-area-summaries'];
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    for (const id of sections)
      await expect(page.locator(`#${id}`).getByRole('table').first()).toBeVisible({
        timeout: 30_000,
      });
    await expect(page.getByRole('status').filter({ hasText: /^Loading / })).toHaveCount(0);
    const fullMobileDataMs = Math.round(performance.now() - started);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('tablist')).toBeVisible();
    const reads: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('.data')) reads.push(request.url());
    });
    for (const tab of await page.getByRole('tab').all()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
    expect(reads).toEqual([]);
    return { path: url.pathname + url.search, fullMobileDataMs };
  } catch (error) {
    return { path: url.pathname + url.search, error: String(error) };
  } finally {
    await page.close();
  }
}
