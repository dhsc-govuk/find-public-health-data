import { expect, test } from '@playwright/test';
import { MORTALITY_NAME, MORTALITY_PATH, openIndicatorPage } from '../support/indicator-page.ts';
import { openTopicPage } from '../support/topic-page.ts';

const topicPath = '/topics/mortality-and-life-expectancy?tab-topic=data&ga=E12000007';

test('keeps a horizontal scrollbar available for a table’s tail rows', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await openTopicPage(page, topicPath);
  const region = page.getByRole('region', {
    name: 'Mortality and life expectancy indicators comparison table',
  });
  const table = region.getByRole('table');
  await expect(page.locator('.fphd-table-scroll--enhanced').filter({ has: region })).toBeVisible();
  await table.evaluate((element: HTMLTableElement) => {
    const headHeight = element.tHead?.getBoundingClientRect().height ?? 0;
    window.scrollTo(0, element.getBoundingClientRect().bottom + window.scrollY - headHeight - 20);
  });
  await expect(page.locator('.fphd-sticky-header').filter({ visible: true })).toHaveCount(0);
  const bar = page.locator('.fphd-table-scrollbar--floating');
  await expect(bar).toBeInViewport();
  const thumb = bar.locator('.fphd-table-scrollbar__thumb');
  const box = await thumb.boundingBox();
  if (!box) throw new Error('Scrollbar thumb missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await table.evaluate((element) =>
    window.scrollTo(0, element.getBoundingClientRect().bottom + window.scrollY + 1),
  );
  await expect(bar).toHaveCount(0);
});

for (const javaScriptEnabled of [false, true]) {
  test(`keeps topic identifying columns readable with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, async ({
    browser,
    baseURL,
  }) => {
    if (baseURL === undefined) throw new Error('A base URL is required');
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled,
      viewport: { width: 1024, height: 800 },
    });
    const page = await context.newPage();
    try {
      if (javaScriptEnabled) await openTopicPage(page, topicPath);
      else await page.goto(topicPath);
      const region = page.getByRole('region', {
        name: 'Mortality and life expectancy indicators comparison table',
      });
      const table = region.getByRole('table');
      await expect(table).toBeVisible();
      if (javaScriptEnabled)
        await expect(
          page.locator('.fphd-table-scroll--enhanced').filter({ has: table }),
        ).toBeVisible();
      await region.evaluate((element) => {
        element.scrollLeft = 250;
      });
      await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBe(250);
      const first = table.getByRole('columnheader', { name: 'Indicator', exact: true });
      const second = table.getByRole('columnheader', { name: 'Most recent period', exact: true });
      expect(Math.round((await first.boundingBox())?.x ?? -1)).toBe(
        Math.round((await region.boundingBox())?.x ?? 0),
      );
      if (javaScriptEnabled) {
        await expect
          .poll(async () => Math.round((await second.boundingBox())?.x ?? -1))
          .toBe(
            Math.round(
              ((await first.boundingBox())?.x ?? 0) + ((await first.boundingBox())?.width ?? 0),
            ),
          );
      } else {
        await expect(second).toHaveCSS('position', 'static');
        await expect(first).toHaveCSS('position', 'sticky');
      }
    } finally {
      await context.close();
    }
  });
}

test('pins only one header when an open chart table and the trend table are both visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  const areas = Array.from(
    { length: 10 },
    (_, index) => `as=E080000${String(index + 1).padStart(2, '0')}`,
  ).join('&');
  await openIndicatorPage(page, `${MORTALITY_PATH}?${areas}&cmp-108=england`);
  await page
    .locator('#indicator-data')
    .getByText('View chart data as a table', { exact: true })
    .last()
    .click();
  const chart = page.getByRole('region', { name: /^Chart data table:/ }).filter({ visible: true });
  const trend = page.getByRole('region', { name: `${MORTALITY_NAME} trends over time` });
  await expect(chart).toBeVisible();
  await expect(trend).toBeVisible();
  await chart.evaluate((element) =>
    window.scrollTo(0, element.getBoundingClientRect().bottom + window.scrollY - 300),
  );
  await expect(chart).toBeInViewport();
  await expect(trend).toBeInViewport();
  const header = page.locator('.fphd-sticky-header').filter({ visible: true });
  await expect(header).toHaveCount(1);
  await expect(header).toContainText('Period');
  for (const table of [chart, trend]) {
    expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await table
      .locator('tbody tr')
      .nth(2)
      .evaluate((row) => window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY));
    await expect(header).toHaveCount(1);
    await expect(page.locator('.fphd-table-scrollbar--floating')).toHaveCount(1);
  }
});
