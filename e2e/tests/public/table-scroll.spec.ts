import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { MORTALITY_PATH, openIndicatorPage } from '../support/indicator-page.ts';
import { INVITEE_STORAGE_STATE } from '../support/private-beta.ts';
import { openTopicPage } from '../support/topic-page.ts';

const topicPath = '/topics/mortality-and-life-expectancy?tab-topic=data&ga=E12000007';
// The seeded air pollution indicator, whose long name gives the comparison table a caption
// wider than its columns.
const AIR_POLLUTION_SHORT_ID = 93861;

test('keeps a horizontal scrollbar available for a table’s tail rows', async ({
  page,
}, testInfo) => {
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
  await expectNoAccessibilityViolations(page, testInfo);
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

for (const javaScriptEnabled of [false, true]) {
  test(`keeps both indicators' columns in view in the indicator comparison table with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, async ({
    browser,
    baseURL,
  }) => {
    if (baseURL === undefined) throw new Error('A base URL is required');
    const context = await browser.newContext({
      baseURL,
      storageState: INVITEE_STORAGE_STATE,
      javaScriptEnabled,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    try {
      const path = `${MORTALITY_PATH}?compareWith=${AIR_POLLUTION_SHORT_ID}`;
      if (javaScriptEnabled) await openIndicatorPage(page, path);
      else await page.goto(path);
      const region = page.getByRole('region', { name: 'Indicator comparison data table' });
      const table = region.getByRole('table');
      await expect(table.getByRole('columnheader')).toHaveCount(3);
      if (javaScriptEnabled) {
        await expect(
          page.locator('.fphd-table-scroll--enhanced').filter({ has: region }),
        ).toBeVisible();
        await table.scrollIntoViewIfNeeded();
        await table.hover();
      }
      // With JavaScript the layout is checked on each of several frames, since a table switching
      // between two layouts would pass a single check half the time. Without it, the page runs no
      // frame callbacks and one check is enough.
      const frameCount = javaScriptEnabled ? 20 : 1;
      const inViewEachFrame = await region.evaluate(
        (element, count) =>
          new Promise<boolean[]>((resolve) => {
            const frames: boolean[] = [];
            const check = () => {
              const { left, right } = element.getBoundingClientRect();
              const headers = [...element.querySelectorAll('thead th')];
              frames.push(
                headers.every((header) => {
                  const box = header.getBoundingClientRect();
                  return box.left >= left - 1 && box.right <= right + 1;
                }),
              );
              if (frames.length < count) requestAnimationFrame(check);
              else resolve(frames);
            };
            check();
          }),
        frameCount,
      );
      expect(inViewEachFrame).toEqual(Array(frameCount).fill(true));
    } finally {
      await context.close();
    }
  });
}
