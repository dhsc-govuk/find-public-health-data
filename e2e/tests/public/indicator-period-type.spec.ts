import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { openIndicatorPage } from '../support/indicator-page.ts';

/** England publishes 1 year and 3 year rolling average data for this indicator, Oxford only 3 year. */
const PATH = '/indicator/mortality-rate-for-deaths-involving-diabetes-all-ages';
const OXFORD_NOTICE = 'Showing 3 year rolling averages because Oxford has no 1 year data.';

function chartOptions(page: Page) {
  return page.locator('#indicator-data details', {
    has: page.getByText('Chart options', { exact: true }),
  });
}

function trendChart(page: Page) {
  return page.getByRole('region', { name: /trend chart$/ });
}

function trendTable(page: Page) {
  return page.getByRole('table', { name: /^Table:/ });
}

test('shows one chart of 1 year data when the indicator has both period types', async ({
  page,
}, testInfo) => {
  await openIndicatorPage(page, PATH);
  const select = chartOptions(page).getByLabel('Type of time period', { exact: true });
  await expect(select).toHaveValue('1-year');
  await expect(select.locator('option')).toHaveText(['1 year', '3 year rolling average']);
  await expect(trendChart(page).locator('.fphd-chart-canvas')).toHaveCount(1);
  await expect(trendChart(page).locator('.recharts-label')).toHaveText('Year');
  await expect(
    trendTable(page).getByRole('rowheader', { name: '2024', exact: true }),
  ).toBeVisible();
  await expect(
    trendTable(page).getByRole('rowheader', { name: '2022 to 2024', exact: true }),
  ).toHaveCount(0);

  await select.selectOption('3 year rolling average');
  await expect(page).toHaveURL(/pt-93995=3-year/);
  await expect(trendChart(page).locator('.fphd-chart-canvas')).toHaveCount(1);
  await expect(trendChart(page).locator('.recharts-label')).toHaveText('Period');
  await expect(
    trendTable(page).getByRole('rowheader', { name: '2022 to 2024', exact: true }),
  ).toBeVisible();
  await expect(trendTable(page).getByRole('rowheader', { name: '2024', exact: true })).toHaveCount(
    0,
  );
  await expectNoAccessibilityViolations(page, testInfo);
});

test('switches to the 3 year rolling average chart with England when Oxford has no 1 year data', async ({
  page,
}, testInfo) => {
  await openIndicatorPage(page, `${PATH}?pt-93995=1-year`);
  const geographies = page.locator('#indicator-data').locator('.fphd-filter-card', {
    has: page.getByRole('button', { name: 'Geographies', exact: true, includeHidden: true }),
  });
  await geographies.getByLabel('Search for a geography').fill('Oxford');
  await geographies.getByRole('checkbox', { name: 'Oxford', exact: true }).check();
  await expect(page).toHaveURL(/as=E07000178/);

  const options = chartOptions(page);
  await expect(options.getByLabel('Type of time period', { exact: true })).toHaveValue('3-year');
  await expect(options.getByRole('status')).toHaveText(OXFORD_NOTICE);
  await expect(trendChart(page).locator('.fphd-chart-canvas')).toHaveCount(1);
  await expect(trendChart(page).locator('.recharts-label')).toHaveText('Period');
  const labels = trendChart(page).locator('.fphd-chart-series-label');
  await expect(labels).toHaveCount(2);
  await expect(labels.filter({ hasText: /^Oxford$/ })).toHaveCount(1);
  await expect(labels.filter({ hasText: /^England$/ })).toHaveCount(1);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('returns to 1 year data when the area without it is removed', async ({ page }, testInfo) => {
  await openIndicatorPage(page, `${PATH}?pt-93995=1-year&cmp-93995=england&as=E07000178`);
  const options = chartOptions(page);
  const select = options.getByLabel('Type of time period', { exact: true });
  await expect(select).toHaveValue('3-year');
  await expect(options.getByRole('status')).toHaveText(OXFORD_NOTICE);

  await page.getByRole('link', { name: 'Remove Oxford filter', exact: true }).click();
  await expect(page).not.toHaveURL(/as=E07000178/);
  await expect(select).toHaveValue('1-year');
  await expect(options.getByRole('status')).toHaveText('');
  await expect(trendChart(page).locator('.recharts-label')).toHaveText('Year');
  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows 3 year rolling averages for Oxford and applies a period type through the GET form', async ({
    page,
  }) => {
    await page.goto(`${PATH}?as=E07000178&cmp-93995=england&pt-93995=1-year`);
    const options = chartOptions(page);
    await expect(options.getByLabel('Type of time period', { exact: true })).toHaveValue('3-year');
    await expect(options.getByRole('status')).toHaveText(OXFORD_NOTICE);
    const table = trendTable(page);
    await expect(table.getByRole('rowheader', { name: '2022 to 2024', exact: true })).toBeVisible();
    await expect(table.getByRole('rowheader', { name: '2024', exact: true })).toHaveCount(0);

    await page.goto(PATH);
    await options
      .getByLabel('Type of time period', { exact: true })
      .selectOption('3 year rolling average');
    await options.getByRole('button', { name: 'Apply options' }).click();
    await expect(page).toHaveURL(/pt-93995=3-year/);
    await expect(table.getByRole('rowheader', { name: '2022 to 2024', exact: true })).toBeVisible();
    await expect(table.getByRole('rowheader', { name: '2024', exact: true })).toHaveCount(0);
  });
});
