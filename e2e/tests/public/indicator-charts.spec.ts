import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { MORTALITY_PATH, openIndicatorPage } from '../support/indicator-page.ts';

const codes = [
  'E10000032',
  'E06000052',
  'E09000003',
  'E09000004',
  'E08000025',
  'E06000008',
  'E06000009',
  'E08000001',
  'E06000058',
  'E09000005',
  'E06000023',
];

for (const count of [1, 2, 8, 12]) {
  for (const width of [1020, 375]) {
    test(`renders ${count} series with ${width === 375 ? 'a mobile key' : 'direct labels'} at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const query = new URLSearchParams(codes.slice(0, count - 1).map((code) => ['as', code]));
      const path = `${MORTALITY_PATH}?${query}&cmp-108=england`;
      if (width === 375) {
        await page.goto(path);
        await expect(page.locator('.govuk-tabs')).not.toHaveClass(/fphd-tabs--ssr/);
      } else await openIndicatorPage(page, path);
      const region = page.getByRole('region', { name: /trend chart$/ }).first();
      const chart = region.locator('.fphd-chart-canvas').first();
      await expect(chart.locator('.recharts-label')).toHaveText('Year');
      await expect(
        region.locator('.fphd-chart-canvas').nth(1).locator('.recharts-label'),
      ).toHaveText('Period');
      const title = chart.locator('.fphd-line-axis-title');
      const axis = chart.locator('.recharts-yAxis .recharts-cartesian-axis-line');
      await expect(title).toBeVisible();
      if (width === 1020) await expect(title.locator('tspan')).toHaveCount(1);
      // The title is measured after the chart first draws, so its position settles a frame later.
      await expect
        .poll(async () => {
          const [titleBox, axisBox] = await Promise.all([title.boundingBox(), axis.boundingBox()]);
          if (!titleBox || !axisBox) return null;
          return {
            insidePage: titleBox.x >= 0 && titleBox.x + titleBox.width <= width,
            centred: Math.abs(titleBox.x + titleBox.width / 2 - axisBox.x) < 1,
          };
        })
        .toEqual({ insidePage: true, centred: true });
      await expect(chart.locator('.fphd-chart-series-label')).toHaveCount(
        width === 375 ? 0 : count,
      );
      if (width === 375) {
        await expect(
          region.getByRole('list', { name: 'Chart key' }).first().getByRole('listitem'),
        ).toHaveCount(count);
      } else {
        await expect(region.getByRole('list', { name: 'Chart key' })).toHaveCount(0);
        const targets = await chart.locator('.fphd-chart-series-label').evaluateAll((labels) =>
          labels.map((label) => {
            const rect = label.parentElement?.querySelector('rect');
            return [Number(rect?.getAttribute('width')), Number(rect?.getAttribute('height'))];
          }),
        );
        expect(
          targets.every(([width, height]) => Number(width) >= 110 && Number(height) >= 22),
        ).toBe(true);
      }
      await expectNoAccessibilityViolations(page, testInfo);
    });
  }
}

test('hovering a point or end label mutes other series and clicking pins the tooltip', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1020, height: 1000 });
  await openIndicatorPage(page, `${MORTALITY_PATH}?as=E10000032&cmp-108=england`);
  const chart = page
    .getByRole('region', { name: /trend chart$/ })
    .first()
    .locator('.fphd-chart-canvas')
    .first();
  const labels = chart.locator('.fphd-chart-series-label');
  await labels.first().hover();
  await expect(labels.nth(1)).toHaveAttribute('fill', '#b1b4b6');
  await expect(chart.getByRole('status')).toHaveCount(0);
  const point = chart.locator('.fphd-chart-point[data-series="0"]').first();
  await point.hover();
  const tooltip = chart.getByRole('status').first();
  await expect(tooltip).toContainText('Value:');
  await expect(tooltip).toContainText('Period:');
  await expect(tooltip).toContainText('Area:');
  await expect(tooltip).toHaveCSS('font-size', '15px');
  await expect(tooltip).toHaveCSS('line-height', '25.5px');
  await expect(chart.locator('.fphd-chart-tooltip-leader line').first()).toHaveAttribute(
    'stroke-width',
    '2',
  );
  await expect(chart.locator('.fphd-chart-point-ring')).toHaveCount(1);
  await point.click();
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeVisible();
  await expect(labels.filter({ hasText: 'England' })).toHaveAttribute('fill', '#b1b4b6');
  await expectNoAccessibilityViolations(page, testInfo);
  await page.getByRole('heading', { level: 1 }).click();
  await expect(chart.getByRole('status')).toHaveCount(0);
});

test('average bars are sorted highest to lowest and retain muting while pinned', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1020, height: 1000 });
  await openIndicatorPage(page, `${MORTALITY_PATH}?tab-indicator=inequalities`);
  const chart = page.getByRole('region', { name: /^Inequalities:/ }).first();
  const bars = chart.locator('.recharts-bar-rectangle');
  await expect(bars.first()).toBeVisible();
  const values = await chart.locator('.fphd-bar-value').allTextContents();
  const numbers = values.map((value) => Number(value.replaceAll(',', '').match(/[\d.]+/)?.[0]));
  expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  await expect(chart.locator('.recharts-reference-line-line')).toHaveAttribute('stroke-width', '1');
  await expect(chart.locator('.fphd-bar-axis-title')).toHaveText('Segment');
  await bars.first().hover();
  const tooltip = chart.getByRole('status');
  await expect(tooltip).toContainText('England average:');
  await expect(tooltip).toContainText('Comparison: Higher than average');
  await expect(tooltip).toHaveCSS('background-color', 'rgb(244, 106, 37)');
  const firstPosition = await tooltip.boundingBox();
  await bars.first().hover({ position: { x: 3, y: 5 } });
  expect((await tooltip.boundingBox())?.x).toBe(firstPosition?.x);
  await bars.first().click();
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeVisible();
  await expect(bars.nth(1).locator('path')).toHaveAttribute('fill', '#b1b4b6');
  await expectNoAccessibilityViolations(page, testInfo);
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(chart.locator('text').filter({ hasText: 'Most deprived' }).first()).toContainText(
    'Most deprived',
  );
  const canvas = await chart.locator('.fphd-chart-canvas').boundingBox();
  for (const box of await chart.locator('.fphd-bar-value').evaluateAll((labels) =>
    labels.map((label) => ({
      left: label.getBoundingClientRect().left,
      right: label.getBoundingClientRect().right,
    })),
  )) {
    expect(box.left).toBeGreaterThanOrEqual(canvas?.x ?? 0);
    expect(box.right).toBeLessThanOrEqual((canvas?.x ?? 0) + (canvas?.width ?? 0));
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

test('Compare areas bars use the England value and match the table judgements', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1020, height: 1000 });
  await openIndicatorPage(
    page,
    '/indicator/mortality-rate-for-deaths-involving-diabetes-all-ages?tab-indicator=areas&areaType=Statistical+regions',
  );
  const chart = page.getByRole('region', { name: /^Compare areas:/ }).first();
  const bars = chart.locator('.recharts-bar-rectangle');
  await expect(bars.first()).toBeVisible();
  await expect(bars.first().locator('path')).toHaveAttribute('fill', '#c00000');
  await expect(chart.locator('.recharts-reference-line-line')).toHaveCount(1);
  await bars.first().hover();
  const tooltip = chart.getByRole('status');
  await expect(tooltip).toContainText('Area:');
  await expect(tooltip).toContainText('Value:');
  await expect(tooltip).toContainText('England:');
  await expect(tooltip).not.toContainText('average');
  await expect(tooltip).toContainText('Comparison: Worse than England');
  const table = page.locator('.fphd-area-comparison-table');
  const england = table.getByRole('row', { name: /^England \(benchmark\)/ });
  const englandValue = await england.locator('td').first().innerText();
  await expect(tooltip).toContainText(`England: ${englandValue}`);
  const firstArea = (await chart.locator('tbody th').first().textContent())?.trim() ?? '';
  const tableRow = table
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: firstArea, exact: true }) });
  await expect(tableRow.locator('td').nth(1)).toHaveText('Worse');
  await expect(chart.locator('.recharts-reference-line-line')).toHaveAttribute('stroke-width', '1');
  await expectNoAccessibilityViolations(page, testInfo);
});
