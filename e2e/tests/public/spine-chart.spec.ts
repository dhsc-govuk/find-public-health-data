import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { openIndicatorPage } from '../support/indicator-page.ts';
import { openTopicPage } from '../support/topic-page.ts';

const indicator =
  '/indicator/mortality-rate-for-deaths-involving-diabetes-all-ages?as=E10000032&as=E08000025&as=E10000011&cmp-93995=england&cr-93995=yes';

test("lines up England's benchmark down each column of comparison charts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openIndicatorPage(page, indicator);
  const plots = page.locator('#indicator-data .fphd-range-plot');
  await expect(plots.first()).toBeVisible();
  const lines = await plots.evaluateAll((elements) =>
    elements.map((plot) => {
      const line = plot.querySelector('.fphd-range-benchmark')?.getBoundingClientRect();
      const box = plot.getBoundingClientRect();
      return {
        column: plot.closest('td')?.cellIndex ?? -1,
        x: line ? Math.round(line.left + line.width / 2) : null,
        middle: Math.round(box.left + box.width / 2),
      };
    }),
  );
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.every(({ column }) => column >= 0)).toBe(true);
  for (const { x, middle } of lines) expect(Math.abs((x ?? 0) - middle)).toBeLessThanOrEqual(1);
  for (const column of new Set(lines.map(({ column }) => column))) {
    const xs = new Set(lines.filter((line) => line.column === column).map(({ x }) => x));
    expect(xs.size).toBe(1);
  }
});

for (const width of [1020, 375]) {
  test(`tick and dot are independently hoverable with distinct contextual tooltips at ${width}px`, async ({
    page,
  }, testInfo) => {
    await openIndicatorPage(page, indicator);
    await page.setViewportSize({ width, height: 900 });
    const chart = page.locator('#indicator-data .fphd-range-plot').first();
    await chart.scrollIntoViewIfNeeded();
    await chart.locator('.fphd-range-target').first().hover({ force: true });
    await expect(page.getByRole('tooltip')).toHaveCount(1);
    await expect(page.getByRole('tooltip')).toContainText('Period:');
    await expect(page.getByRole('tooltip')).toContainText('Value:');
    await expect(page.getByRole('tooltip')).toContainText('Area: England');
    await expect(page.getByRole('tooltip')).not.toContainText('Comparison:');
    await expect(page.getByRole('tooltip')).toHaveCSS('font-family', /GDS Transport/);
    await chart.locator('.fphd-range-target').last().hover({ force: true });
    await expect(page.getByRole('tooltip')).toHaveCount(1);
    await expect(page.getByRole('tooltip')).toContainText('Comparison: Better than England');
    await expect(page.getByRole('tooltip')).toContainText('Area: West Sussex');
    await expect(page.getByRole('tooltip')).toContainText(
      'Mortality rate for deaths involving diabetes, all ages',
    );
    await page.getByRole('tooltip').hover();
    await expect(page.getByRole('tooltip')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await chart.locator('.fphd-range-target').last().focus();
    await expect(page.getByRole('tooltip')).toHaveCount(1);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test(`overlapping marks show both tooltips and flip below near the top at ${width}px`, async ({
    page,
  }, testInfo) => {
    await openIndicatorPage(page, indicator);
    await page.setViewportSize({ width, height: 900 });
    const chart = page.locator('#indicator-data .fphd-range-plot').nth(2);
    await chart.scrollIntoViewIfNeeded();
    await chart.evaluate((element) =>
      window.scrollBy(0, element.getBoundingClientRect().top - 400),
    );
    await chart.locator('.fphd-range-target').last().focus();
    await expect(page.getByRole('tooltip')).toHaveCount(2);
    const placements = await page
      .getByRole('tooltip')
      .evaluateAll((elements) => elements.map((e) => e.getAttribute('data-placement')));
    expect(placements.sort()).toEqual(['above', 'below']);
    await chart.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - 8));
    await expect(page.getByRole('tooltip').first()).toHaveAttribute('data-placement', 'below');
    const boxes = await page
      .getByRole('tooltip')
      .evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().toJSON()));
    expect(boxes[0]?.top).toBeGreaterThanOrEqual(8);
    expect(boxes[1]?.top).toBeGreaterThan(boxes[0]?.bottom ?? 0);
    expect(boxes[1]?.bottom).toBeLessThanOrEqual(900);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test(`the topic Data table has one opening and closing comparison key at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openTopicPage(page, '/topics/mortality-and-life-expectancy?ga=E10000032&tab-topic=data');
    const panel = page.locator('#topic-data');
    const key = panel
      .locator('details')
      .filter({ has: page.getByText('Key to the comparison chart', { exact: true }) });
    await expect(key).toHaveCount(1);
    expect(await panel.locator('.fphd-range-plot').count()).toBeGreaterThan(0);
    await key.locator('summary').click();
    await expect(key).toHaveAttribute('open', '');
    await expect(key.getByText('Dot colour', { exact: true })).toBeVisible();
    await expect(key.getByRole('listitem')).toHaveText([
      'Better',
      'Similar',
      'Worse',
      'Lower (no better or worse)',
      'Higher (no better or worse)',
      'No comparison available',
    ]);
    await expectNoAccessibilityViolations(page, testInfo);
    await key.locator('summary').click();
    await expect(key).not.toHaveAttribute('open', '');
  });
}
