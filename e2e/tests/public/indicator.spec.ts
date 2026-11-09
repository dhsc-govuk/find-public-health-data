import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { downloadFrom } from '../support/downloads.ts';
import { MORTALITY_NAME, MORTALITY_PATH, openIndicatorPage } from '../support/indicator-page.ts';

test.beforeEach(async ({ page }) => {
  await openIndicatorPage(page, MORTALITY_PATH);
});

test('streams the indicator heading and navigation before observations and rankings', async ({
  page,
}) => {
  const response = await page.request.get(MORTALITY_PATH, {
    headers: { 'user-agent': 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36' },
  });
  expect(response.ok()).toBe(true);
  const html = await response.text();
  const shell = html.split('</html>')[0]?.replaceAll('<!-- -->', '');
  expect(shell).toContain(MORTALITY_NAME);
  expect(shell).toContain('indicator-compare-areas');
  expect(shell).toContain('Loading indicator data');
  expect(shell).toContain('Loading area comparisons');
  expect(html).toContain('<table');
});

test('keeps Compare areas in view when changing to mobile and opening its shared link', async ({
  page,
}, testInfo) => {
  await page.getByRole('tab', { name: 'Compare areas', exact: true }).click();
  const panel = page.locator('#indicator-compare-areas');
  const heading = panel.getByRole('heading', { level: 2, name: 'Compare areas', exact: true });
  const selector = panel.getByRole('combobox', { name: 'Type of geography', exact: true });
  await expect(selector).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(heading).toBeInViewport();
  await expect(selector).toBeInViewport();
  await expect(selector).toHaveJSProperty('tagName', 'SELECT');
  for (const id of [
    'indicator-data',
    'indicator-compare-areas',
    'indicator-compare-indicators',
    'indicator-inequalities',
    'indicator-about',
  ]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
  await expect(
    page.locator('#indicator-data').getByRole('table', { name: /^Table:/ }),
  ).toBeVisible();
  await expect(
    page.locator('#indicator-compare-indicators').getByLabel('Search for an indicator'),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: /Table of inequalities/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data attributes' })).toBeVisible();
  await page.reload();
  await expect(heading).toBeInViewport();
  await expect(selector).toBeInViewport();
  await expectNoAccessibilityViolations(page, testInfo);
  await page
    .locator('.govuk-tabs__list')
    .getByRole('link', { name: 'Compare indicators', exact: true })
    .click();
  await expect(page).toHaveURL(/#indicator-compare-indicators$/);
  await expect(
    page
      .locator('#indicator-compare-indicators')
      .getByRole('heading', { name: 'Compare indicators', exact: true }),
  ).toBeInViewport();
});

test('shows one indicator with its summary and five sections', async ({ page }, testInfo) => {
  await expect(page.getByRole('heading', { level: 1, name: MORTALITY_NAME })).toBeVisible();
  const summaryRow = (name: string) =>
    page
      .locator('.govuk-summary-list__row')
      .filter({ has: page.getByRole('term').filter({ hasText: name }) });
  await expect(summaryRow('Period covered')).toContainText('2015 to 2024');
  await expect(summaryRow('Update frequency')).toContainText('Annually');
  await expect(summaryRow('Definition')).toContainText('Directly age-standardised mortality rate');
  await expect(page.getByRole('tab')).toHaveText([
    'Indicator',
    'Compare areas',
    'Compare indicators',
    'Inequalities',
    'About this indicator',
  ]);
  await expect(page.getByRole('tab', { name: 'Indicator', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('table', { name: /^Table:/ })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('answers an unknown indicator with the not-found page', async ({ page }) => {
  const response = await page.goto('/indicator/no-such-indicator');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

test('redirects a numeric indicator address to its slug and keeps the query', async ({ page }) => {
  const response = await page.request.get('/indicator/108?as=E08000003', { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe(`${MORTALITY_PATH}?as=E08000003`);
});

test('keeps the active section in the URL and supports arrow keys', async ({ page }) => {
  await page.getByRole('tab', { name: 'Indicator', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Compare areas' })).toBeFocused();
  await expect(page).toHaveURL(/tab-indicator=areas/);
  await openIndicatorPage(page, `${MORTALITY_PATH}?tab-indicator=about`);
  await expect(page.getByRole('tab', { name: 'About this indicator' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('switches between loaded indicator sections without another data request', async ({
  page,
}, testInfo) => {
  const areas = page.getByRole('tab', { name: 'Compare areas', exact: true });
  const table = page.getByRole('table', { name: /Table of area comparisons/ });
  await expect(table).toHaveCount(0);
  const reads: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/indicator/') && request.url().includes('.data')) {
      reads.push(request.url());
    }
  });
  await areas.click();
  await expect(areas).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab-indicator=areas/);
  await expect(table).toBeVisible();
  await page.getByRole('tab', { name: 'About this indicator', exact: true }).click();
  await expect(page).toHaveURL(/tab-indicator=about/);
  await expect(page.getByRole('heading', { name: 'Data attributes' })).toBeVisible();
  expect(reads).toEqual([]);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('loads every indicator section through the JavaScript-free fallback and keeps comparison search in view', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('A base URL is required');
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const withoutJs = await context.newPage();
  try {
    await withoutJs.goto(MORTALITY_PATH);
    await withoutJs.getByRole('link', { name: 'Show all sections', exact: true }).click();
    for (const [label, anchor, content] of [
      [
        'Compare areas',
        'indicator-compare-areas',
        withoutJs.getByRole('table', { name: /Table of area comparisons/ }),
      ],
      [
        'Inequalities',
        'indicator-inequalities',
        withoutJs.getByRole('table', { name: /Table of inequalities/ }),
      ],
      [
        'About this indicator',
        'indicator-about',
        withoutJs.getByRole('heading', { name: 'Data attributes' }),
      ],
      [
        'Compare indicators',
        'indicator-compare-indicators',
        withoutJs.getByLabel('Search for an indicator'),
      ],
      ['Indicator', 'indicator-data', withoutJs.getByRole('table', { name: /^Table:/ })],
    ] as const) {
      await expect(content).toBeVisible();
      await withoutJs.getByRole('link', { name: label, exact: true }).click();
      await expect(withoutJs).toHaveURL(new RegExp(`#${anchor}$`));
      await expect(content).toBeVisible();
    }
    await withoutJs.getByRole('link', { name: 'Compare indicators', exact: true }).click();
    const compare = withoutJs.locator('#indicator-compare-indicators');
    await compare.getByLabel('Search for an indicator').fill('diabetes');
    await compare.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(withoutJs).toHaveURL(/find=diabetes.*#indicator-compare-indicators$/);
    await expect(withoutJs.getByLabel('Search for an indicator')).toBeInViewport();
    await expect(withoutJs.getByRole('link', { name: /Diabetes: QOF prevalence/ })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('uses the prototype’s narrow metadata and fixed sidebar across different tab widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openIndicatorPage(page, '/indicator/diabetes-qof-prevalence');
  for (const [tab, width] of [
    ['Indicator', 960],
    ['Compare areas', 1380],
    ['Inequalities', null],
    ['About this indicator', 960],
  ] as const) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: tab, exact: true });
    await expect(panel).not.toHaveAttribute('aria-busy', 'true');
    await expect(panel).toHaveCSS('border-top-width', '0px');
    const panelBorder = await panel.evaluate(
      (element) => getComputedStyle(element).borderBottomColor,
    );
    await expect(page.getByRole('tablist')).toHaveCSS('border-bottom-color', panelBorder);
    if (width === null) {
      const size = Math.round((await panel.boundingBox())?.width ?? 0);
      expect(size).toBeGreaterThanOrEqual(960);
      expect(size).toBeLessThanOrEqual(1380);
    } else {
      await expect
        .poll(async () => Math.round((await panel.boundingBox())?.width ?? 0))
        .toBe(width);
    }
    if (tab !== 'About this indicator') {
      const sidebar = panel.locator('.govuk-grid-column-one-quarter');
      expect(Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(235);
    }
    if (tab === 'Compare areas') {
      const firstArea = panel.getByRole('table').locator('tbody tr').nth(1);
      expect(Math.round((await firstArea.boundingBox())?.height ?? 0)).toBe(29);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  }

  await page.setViewportSize({ width: 2560, height: 1100 });
  await page.getByRole('tab', { name: 'Compare areas', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Compare areas', exact: true });
  await expect(panel).not.toHaveAttribute('aria-busy', 'true');
  await expect.poll(async () => Math.round((await panel.boundingBox())?.width ?? 0)).toBe(2500);
  const table = panel.getByRole('table', { name: /Table of area comparisons/ });
  await expect(table).toHaveCSS('table-layout', 'fixed');
  await expect(table).toHaveCSS('font-size', '16px');
  await expect(table).toHaveCSS('line-height', '20px');
  await expect(table.getByRole('columnheader', { name: 'Value (%)' }).locator('span')).toHaveCSS(
    'font-weight',
    '400',
  );
  const benchmark = table
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'England (benchmark)', exact: true }) });
  await expect(benchmark).toHaveCSS('background-color', 'rgb(243, 242, 241)');
  expect(Math.round((await benchmark.boundingBox())?.height ?? 0)).toBe(29);
});

test('compares areas across a selected geography type and sorts the table', async ({ page }) => {
  await page.getByRole('tab', { name: 'Compare areas' }).click();
  await expect(page.getByRole('combobox', { name: 'Type of geography' })).toHaveValue(
    'Local authorities',
  );
  const table = page.getByRole('table', { name: /Table of area comparisons/ });
  await expect(table.getByRole('rowheader', { name: 'England (benchmark)' })).toBeVisible();
  await expect.poll(() => table.getByRole('row').count()).toBeGreaterThan(20);
  await page.getByRole('combobox', { name: 'Sort by' }).selectOption('alphabetical');
  await expect(page).toHaveURL(/areaSort=alphabetical/);
  await page
    .getByRole('combobox', { name: 'Type of geography' })
    .selectOption('Statistical regions');
  await expect(page).toHaveURL(/areaType=Statistical\+regions/);
  await expect(table.getByRole('rowheader', { name: 'London' })).toBeVisible();
  await page
    .getByRole('tabpanel', { name: 'Compare areas' })
    .getByText('Download or share data', { exact: true })
    .click();
  const exported = await downloadFrom(
    page,
    "Download data for the areas you've chosen (CSV)",
    'link',
  );
  expect(exported.text).toContain('England (benchmark)');
  expect(exported.text).toContain('London');
  expect(exported.text).toContain('Compared with England');
});

test('finds and highlights an area within the selected comparison geography', async ({
  page,
}, testInfo) => {
  await page.getByRole('tab', { name: 'Compare areas' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Compare areas' });
  await panel.getByRole('searchbox', { name: 'Highlight local authorities' }).fill('Leeds');
  const checkbox = panel.getByRole('checkbox', { name: 'Leeds', exact: true });
  await expect(checkbox).toBeVisible();
  await expect(panel.getByText(/No geographies found/)).toHaveCount(0);
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  const table = panel.getByRole('table', { name: /Table of area comparisons/ });
  await expect(
    table
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: 'Leeds', exact: true }) }),
  ).toHaveClass(/fphd-highlighted-area/);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('adds one comparison indicator through search and clears it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Compare indicators' }).click();
  const search = page.getByRole('combobox', { name: 'Search for an indicator' });
  await search.fill('smoking');
  await page.getByRole('option', { name: /Smoking Prevalence in adults/ }).click();
  await expect(page).toHaveURL(/compareWith=/);
  const table = page.getByRole('table', { name: /Table of indicator comparison/ });
  await expect(table.getByRole('rowheader', { name: 'England' })).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: /Smoking Prevalence in adults/ }),
  ).toBeVisible();
  await page
    .getByRole('tabpanel', { name: 'Compare indicators' })
    .getByText('Download or share data', { exact: true })
    .click();
  const exported = await downloadFrom(
    page,
    "Download data for the areas you've chosen (CSV)",
    'link',
  );
  expect(exported.text).toContain(MORTALITY_NAME);
  expect(exported.text).toContain('Smoking Prevalence in adults');
  await page.getByRole('link', { name: 'Clear search' }).click();
  await expect(page).not.toHaveURL(/compareWith=/);
  await expect(table).toHaveCount(0);
});

test('opens a comparison link directly and can return to the indicator tab', async ({
  page,
}, testInfo) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?compareWith=diabetes-qof-prevalence`);
  await expect(page.getByRole('tab', { name: 'Compare indicators' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('table', { name: /Table of indicator comparison/ })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
  await page.getByRole('tab', { name: 'Indicator', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Indicator', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page).toHaveURL(/compareWith=diabetes-qof-prevalence/);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('shows inequalities and methodology', async ({ page }) => {
  await page.getByRole('tab', { name: 'Inequalities' }).click();
  await expect(page.getByRole('heading', { name: 'Inequalities', exact: true })).toBeVisible();
  const table = page.getByRole('table', { name: /Table of inequalities/ });
  await expect(table.getByRole('rowheader', { name: 'England', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Benchmark', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'About this indicator' }).click();
  await expect(page.getByRole('heading', { name: 'Data attributes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Calculation' })).toBeVisible();
});

test("shows a rate's numerator, not a count, on the indicator page and in its download", async ({
  page,
}) => {
  const options = page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('button', { name: 'Table columns', exact: true }) });
  await options.getByRole('button', { name: 'Table columns', exact: true }).click();
  await expect(options.getByRole('checkbox', { name: 'Numerator', exact: true })).toBeVisible();
  await expect(options.getByRole('checkbox', { name: 'Count', exact: true })).toHaveCount(0);
  await page
    .getByRole('tabpanel', { name: 'Indicator', exact: true })
    .getByText('Download or share data', { exact: true })
    .click();
  const all = await downloadFrom(page, 'Download data for all areas (CSV)', 'link');
  expect(all.text.split('\n')[0]).toContain('Count,Numerator,Denominator');
  await page.getByRole('tab', { name: 'Inequalities' }).click();
  const table = page.getByRole('table', { name: /Table of inequalities/ });
  await expect(table.getByRole('columnheader', { name: 'Numerator', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Count', exact: true })).toHaveCount(0);
});

test('downloads the indicator table and complete data', async ({ page }) => {
  await page
    .getByRole('tabpanel', { name: 'Indicator', exact: true })
    .getByText('Download or share data', { exact: true })
    .click();
  const table = await downloadFrom(page, "Download data for the areas you've chosen (CSV)", 'link');
  expect(table.filename).toContain('.csv');
  expect(table.text).toContain('England calculated value');
  const all = await downloadFrom(page, 'Download data for all areas (CSV)', 'link');
  expect(all.filename).toContain('.csv');
  expect(all.text).toContain(MORTALITY_NAME);
  expect(all.text).toContain('London');
  const metadata = await downloadFrom(page, 'Download metadata about this indicator (TXT)', 'link');
  expect(metadata.filename).toMatch(/metadata\.txt$/);
  expect(metadata.text).toContain(MORTALITY_NAME);
  expect(metadata.text).toContain('Numerator definition:');
});

test('plots trends, area comparisons, inequalities and paired indicators', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openIndicatorPage(page, '/indicator/diabetes-qof-prevalence');
  const trend = page.getByRole('region', { name: 'Diabetes: QOF prevalence trend chart' });
  await expect(trend.getByRole('application').locator('.recharts-line-curve')).toBeVisible();
  await trend.getByText('View chart data as a table', { exact: true }).click();
  await expect(trend.getByRole('table')).toContainText('7.9%');
  await page.getByRole('tab', { name: 'Compare areas', exact: true }).click();
  const table = page.getByRole('table', { name: /Table of area comparisons/ });
  const slough = table
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Slough', exact: true }) });
  const bar = slough.locator('.fphd-comparison-bar rect').nth(1);
  await expect(bar).toHaveAttribute('fill', /^#[0-9a-f]{6}$/i);
  expect(Number(await bar.getAttribute('width'))).toBeGreaterThan(70);
  expect(Number(await bar.getAttribute('width'))).toBeLessThan(80);
  const chart = page.getByRole('region', { name: /^Compare areas: Diabetes: QOF prevalence/ });
  await expect(
    chart.getByRole('application').locator('.recharts-bar-rectangle').first(),
  ).toBeVisible();
  const tableBox = await table.boundingBox();
  const chartBox = await chart.boundingBox();
  expect(chartBox?.x).toBeGreaterThan((tableBox?.x ?? 0) + (tableBox?.width ?? 0));
  await page.getByRole('tablist').evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: testInfo.outputPath('comparison-charts.png') });
  await expectNoAccessibilityViolations(page, testInfo);
  await page.getByRole('combobox', { name: 'Colour geographies by' }).selectOption('quintiles');
  await expect(bar).toHaveAttribute('fill', /#440154|#3E4A89|#26828E|#35B779|#B4DE2C/);
  await page.getByLabel('Colour areas by', { exact: true }).selectOption('yes');
  await expect(page).toHaveURL(/quintile-241=yes/);
  await expect(chart).toContainText(
    'Quintiles rank values across all areas of the same geography level.',
  );
  await expect(chart.locator('.recharts-bar-rectangle path').first()).toHaveAttribute(
    'fill',
    /#c5eee9|#84cac2|#27a096|#027068|#004842/,
  );
  await openIndicatorPage(page, `${MORTALITY_PATH}?tab-indicator=inequalities`);
  await expect(
    page
      .getByRole('application', { name: /^Inequalities:/ })
      .locator('.recharts-bar-rectangle')
      .first(),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
  await openIndicatorPage(
    page,
    `${MORTALITY_PATH}?compareWith=under-75-mortality-rate-from-cancer`,
  );
  const scatter = page.getByRole('application', {
    name: /^Under 75 mortality rate from cancer compared with Under 75 mortality rate from all causes/,
  });
  await expect(scatter.locator('.recharts-scatter-symbol').first()).toBeVisible();
  await page.getByRole('button', { name: 'Swap axes' }).click();
  await expect(
    page.getByRole('application', {
      name: /^Under 75 mortality rate from all causes compared with Under 75 mortality rate from cancer/,
    }),
  ).toBeVisible();
  const comparisonChart = page.locator('#compare-chart-section');
  await comparisonChart.getByText('View chart data as a table', { exact: true }).click();
  await expect(
    comparisonChart.getByRole('rowheader', { name: 'England', exact: true }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('keeps the comparison table usable beside the geography controls on tablets', async ({
  page,
}, testInfo) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?tab-indicator=areas`);
  const panel = page.getByRole('tabpanel', { name: 'Compare areas', exact: true });
  for (const width of [641, 768, 834, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    const table = await panel.locator('.fphd-area-table').boundingBox();
    const map = await panel.locator('.fphd-map-space').boundingBox();
    expect(table?.width).toBeGreaterThanOrEqual(300);
    expect(map?.y).toBeGreaterThanOrEqual((table?.y ?? 0) + (table?.height ?? 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

test('keeps a pending geography choice when sorting the area table', async ({ page }, testInfo) => {
  await page.getByRole('tab', { name: 'Compare areas', exact: true }).click();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pattern = '**/indicator/*.data?*';
  await page.route(pattern, async (route) => {
    started();
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page
      .getByRole('combobox', { name: 'Type of geography', exact: true })
      .selectOption('Statistical regions');
    await request;
    await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('alphabetical');
  } finally {
    release();
  }
  await expect(page).toHaveURL(/areaType=Statistical/);
  await expect(page).toHaveURL(/areaSort=alphabetical/);
  await expect(page.getByRole('combobox', { name: 'Type of geography', exact: true })).toHaveValue(
    'Statistical regions',
  );
  await expect(
    page
      .getByRole('table', { name: /Table of area comparisons/ })
      .getByRole('rowheader', { name: 'London', exact: true }),
  ).toBeVisible();
  await page.unroute(pattern);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('keeps the full tab labels in one connected row at tablet and desktop widths', async ({
  page,
}, testInfo) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?tab-indicator=about`);
  for (const width of [834, 768, 641, 960, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole('tab')).toHaveText([
      'Indicator',
      'Compare areas',
      'Compare indicators',
      'Inequalities',
      'About this indicator',
    ]);
    const boxes = await page.locator('.govuk-tabs__list-item').evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      }),
    );
    expect(
      Math.max(...boxes.map(({ top }) => top)) - Math.min(...boxes.map(({ top }) => top)),
    ).toBeLessThanOrEqual(5);
    expect(Math.max(...boxes.map(({ right }) => right))).toBeLessThanOrEqual(width);
    const inactiveHeights = await page
      .locator('.govuk-tabs__list-item:not(.govuk-tabs__list-item--selected)')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(Math.max(...inactiveHeights) - Math.min(...inactiveHeights)).toBeLessThanOrEqual(1);
    expect(
      Math.max(...boxes.map(({ bottom }) => bottom)) -
        Math.min(...boxes.map(({ bottom }) => bottom)),
    ).toBeLessThanOrEqual(1);
    if (width === 641) {
      const rowPosition = () =>
        page.getByRole('tablist').evaluate((element) => {
          const { top, height } = element.getBoundingClientRect();
          return { top: top + window.scrollY, height };
        });
      const initial = await rowPosition();
      for (const label of ['Compare areas', 'About this indicator']) {
        await page.getByRole('tab', { name: label, exact: true }).click();
        await expect(page.getByRole('tabpanel', { name: label, exact: true })).not.toHaveAttribute(
          'aria-busy',
          'true',
        );
        const current = await rowPosition();
        expect(Math.abs(current.top - initial.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(current.height - initial.height)).toBeLessThanOrEqual(1);
      }
    }
    await expect(page.locator('.fphd-tabs__navigation')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const selected = await page.locator('.govuk-tabs__list-item--selected').boundingBox();
    const panel = await page.getByRole('tabpanel', { name: 'About this indicator' }).boundingBox();
    expect(
      Math.abs((selected?.y ?? 0) + (selected?.height ?? 0) - (panel?.y ?? 0)),
    ).toBeLessThanOrEqual(2);
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

test('shows Contents links and every section on first load on small screens', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(MORTALITY_PATH);
  await expect(page.locator('.govuk-tabs')).not.toHaveClass(/fphd-tabs--ssr/);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: `${MORTALITY_NAME} contents`, exact: true }),
  ).toBeVisible();
  const ids = [
    'indicator-data',
    'indicator-compare-areas',
    'indicator-compare-indicators',
    'indicator-inequalities',
    'indicator-about',
  ];
  const labels = [
    'Indicator',
    'Compare areas',
    'Compare indicators',
    'Inequalities',
    'About this indicator',
  ];
  for (const [index, label] of labels.entries()) {
    await expect(
      page.locator('.govuk-tabs__list').getByRole('link', { name: label, exact: true }),
    ).toHaveAttribute('href', new RegExp(`#${ids[index]}$`));
    await expect(
      page.locator(`#${ids[index]}`).getByRole('heading', { level: 2, name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole('region', { name: `${MORTALITY_NAME} trend chart` })).toBeVisible();
  const map = page.getByRole('region', { name: `${MORTALITY_NAME} map` });
  await expect(map).toBeVisible();
  await page
    .locator('.govuk-tabs__list')
    .getByRole('link', { name: 'Compare areas', exact: true })
    .click();
  await expect(page).toHaveURL(/#indicator-compare-areas$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await expectNoAccessibilityViolations(page, testInfo);
  await page
    .locator('.govuk-tabs__list')
    .getByRole('link', { name: 'About this indicator', exact: true })
    .click();
  await expect(page).toHaveURL(/#indicator-about$/);
  await page.setViewportSize({ width: 641, height: 1000 });
  await expect(page.getByRole('tab', { name: 'About this indicator' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('keeps the indicator comparison controls accessible in the stacked mobile view', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(`${MORTALITY_PATH}?compareWith=diabetes-qof-prevalence`);
  await expect(page.locator('.govuk-tabs')).not.toHaveClass(/fphd-tabs--ssr/);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Indicator comparison scatter chart' }),
  ).toBeVisible();
  const ids = await page
    .locator('[id]')
    .evaluateAll((elements) => elements.map((element) => element.id));
  expect(ids.length).toBe(new Set(ids).size);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('keeps the primary indicator when a shared comparison is unavailable', async ({
  page,
}, testInfo) => {
  await openIndicatorPage(
    page,
    `${MORTALITY_PATH}?compareWith=no-such-indicator&tab-indicator=compare&as=E08000003`,
  );
  await expect(page).toHaveURL(`${MORTALITY_PATH}?tab-indicator=compare&as=E08000003`);
  await expect(page.getByRole('heading', { level: 1, name: MORTALITY_NAME })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Search for an indicator' })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});
