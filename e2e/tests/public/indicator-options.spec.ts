import { expect, type Locator, test } from '@playwright/test';
import { parse } from 'csv-parse/sync';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { filterCard, MORTALITY_PATH, openIndicatorPage } from '../support/indicator-page.ts';

function trendTable(page: import('@playwright/test').Page) {
  return page.getByRole('table', { name: /^Table:/ });
}

test('adds IMD 2025, neighbours and the combined authority for Manchester diabetes data', async ({
  page,
}) => {
  await openIndicatorPage(page, '/indicator/diabetes-qof-prevalence?as=E08000003');
  const benchmarks = filterCard(page, 'Benchmarks');
  const imdLabel =
    'Areas with similar deprivation to the selected area (Index of Multiple Deprivation (IMD) 2025)';
  await benchmarks.getByRole('checkbox', { name: imdLabel, exact: true }).check();
  await benchmarks
    .getByRole('checkbox', { name: 'Statistical neighbours (Manchester)', exact: true })
    .check();
  await benchmarks
    .getByRole('checkbox', { name: 'Combined authority (Manchester)', exact: true })
    .check();
  const table = trendTable(page);
  for (const name of [
    'Decile 1 (IMD 2025)',
    'Statistical neighbours (Manchester)',
    'Combined authority (Manchester)',
    'Compared with similarly deprived areas (IMD 2025)',
  ]) {
    await expect(table.getByRole('columnheader', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: /^Show \d+ more filters$/ }).click();
  await expect(
    page.getByRole('link', { name: `Remove ${imdLabel} filter`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Remove Statistical neighbours (Manchester) filter',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(benchmarks.getByRole('checkbox', { name: imdLabel, exact: true })).toBeChecked();
  await expect(
    benchmarks.getByRole('checkbox', { name: 'Statistical neighbours (Manchester)', exact: true }),
  ).toBeChecked();
  await expect(
    benchmarks.getByRole('checkbox', { name: 'Combined authority (Manchester)', exact: true }),
  ).toBeChecked();
  await expect(
    page
      .locator('#indicator-trend-chart .fphd-chart-series-label')
      .filter({ hasText: /^Statistical neighbours \(Manchester\)$/ }),
  ).toBeVisible();
});

test('uses upper-tier council spreads for England and South East on West Sussex diabetes data', async ({
  page,
}) => {
  await openIndicatorPage(
    page,
    '/indicator/diabetes-qof-prevalence?as=E10000032&cmp-241=england&cmp-241=region',
  );
  const table = trendTable(page);
  const latest = table
    .locator('tbody tr')
    .filter({ has: page.getByRole('rowheader', { name: '2024 to 2025', exact: true }) });
  const values = await latest.locator('td.fphd-trend-table__benchmark-cell').allTextContents();
  expect(values.slice(1, 5)).toEqual(['2.8%', '7.1%', '9.0%', '11.0%']);
  expect(values.slice(6, 10)).toEqual(['5.0%', '6.5%', '7.9%', '11.0%']);
});

async function selectEarlierInequalityPeriod(options: Locator) {
  const select = options.getByLabel('Time period', { exact: true });
  const previous = await select.inputValue();
  const [value] = await select.selectOption({ index: 1 });
  if (value === undefined) throw new Error('Expected an earlier published inequality period');
  expect(value).not.toBe(previous);
  const label = await select.locator('option:checked').innerText();
  return { value, label };
}

test('uses the selected period label when options change during selection', async ({ page }) => {
  await page.setContent(`
    <label for="period">Time period</label><select id="period">
      <option value="2025">2025</option>
      <option value="2024">2024</option>
    </select>
    <script>
      document.querySelector('select').addEventListener('input', (event) => {
        event.target.selectedOptions[0].textContent = '2024 revised';
      });
    </script>
  `);
  const period = await selectEarlierInequalityPeriod(page.locator('body'));
  expect(period).toEqual({ value: '2024', label: '2024 revised' });
});

test('table options update the series and keep their choices on reload', async ({
  page,
}, testInfo) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?cr-108=yes&cr-compare=no`);
  const options = page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('button', { name: 'Table columns', exact: true }) });
  await options.getByRole('button', { name: 'Table columns', exact: true }).click();
  const table = trendTable(page);
  await options.getByLabel('Select sex').selectOption('Male');
  await expect(page).toHaveURL(/sex-108=Male/);
  await expect(page).not.toHaveURL(/cr-/);
  await expect(table).toHaveAccessibleName(
    /<75 yrs, Male\s*, table with \d+ rows and \d+ columns$/,
  );
  await options.getByLabel('Type of time period').selectOption('3 year rolling average');
  await expect(page).toHaveURL(/pt-108=3-year/);
  await expect(table.getByRole('rowheader', { name: '2015 to 2017', exact: true })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: '2024', exact: true })).toHaveCount(0);
  await options.getByRole('checkbox', { name: '95% confidence intervals', exact: true }).check();
  await options.getByRole('checkbox', { name: 'Count', exact: true }).check();
  await expect(table.getByRole('columnheader', { name: 'Count', exact: true })).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: '95% lower confidence interval' }),
  ).toBeVisible();
  await page.reload();
  await expect(table).toHaveAccessibleName(
    /<75 yrs, Male\s*, table with \d+ rows and \d+ columns$/,
  );
  await expectNoAccessibilityViolations(page, testInfo);
});

test('checks England for the first picked area and preserves an unchecked choice when picking again', async ({
  page,
}) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?geo-level=Upper-tier%20local%20authorities`);
  const geographies = page.locator('#indicator-data').locator('.fphd-filter-card', {
    has: page.getByRole('button', { name: 'Geographies', exact: true, includeHidden: true }),
  });
  const manchester = geographies.getByRole('checkbox', { name: 'Manchester', exact: true });
  await manchester.check();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('as') === 'E08000003' && url.searchParams.get('cmp-108') === 'england',
  );
  const benchmarks = filterCard(page, 'Benchmarks');
  const england = benchmarks.getByRole('checkbox', { name: 'England', exact: true });
  await expect(england).toBeChecked();
  await england.uncheck();
  await manchester.uncheck();
  await expect(benchmarks).toHaveCount(0);
  await manchester.check();
  await expect(england).not.toBeChecked();
  await expect(page).toHaveURL((url) => url.searchParams.getAll('cmp-108').join() === '');
});

test('selected geography and benchmark options stay on the one indicator page', async ({
  page,
}) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?as=E08000003`);
  const benchmarks = filterCard(page, 'Benchmarks');
  await benchmarks.getByRole('checkbox', { name: 'England', exact: true }).check();
  await expect(page).toHaveURL(/cmp-108=england/);
  await expect(trendTable(page).getByRole('columnheader', { name: 'Manchester' })).toBeVisible();
  await expect(
    trendTable(page).getByRole('columnheader', { name: 'England', exact: true }),
  ).toBeVisible();
  const table = trendTable(page);
  for (const name of ['Lowest', '25th percentile', '75th percentile', 'Highest']) {
    await expect(table.getByRole('columnheader', { name, exact: true })).toBeVisible();
  }
  await expect(table.getByRole('columnheader', { name: 'Compared with England' })).toBeVisible();
  await benchmarks.getByRole('checkbox', { name: 'Statistical regions' }).check();
  await expect(page).toHaveURL(
    (url) => url.searchParams.getAll('cmp-108').join() === 'england,region',
  );
  await expect(table.getByRole('columnheader', { name: 'England', exact: true })).toHaveCount(1);
  await expect(
    table.getByRole('columnheader', { name: 'North West (Statistical region)' }),
  ).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Compared with North West' })).toBeVisible();
  await page.getByRole('link', { name: 'Remove England filter', exact: true }).click();
  await expect(
    benchmarks.getByRole('checkbox', { name: 'England', exact: true }),
  ).not.toBeChecked();
  await expect(table.getByRole('columnheader', { name: 'England', exact: true })).toHaveCount(0);
});

test('the benchmark spread and comparison chart columns toggle independently', async ({ page }) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?as=E08000003&cmp-108=england`);
  const options = page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('button', { name: 'Table columns', exact: true }) });
  await options.getByRole('button', { name: 'Table columns', exact: true }).click();
  const table = trendTable(page);
  await options.getByRole('checkbox', { name: 'Minimum/Maximum values', exact: true }).uncheck();
  await expect(table.getByRole('columnheader', { name: 'Lowest', exact: true })).toHaveCount(0);
  await expect(table.getByRole('columnheader', { name: '25th percentile' })).toBeVisible();
  await options.getByRole('checkbox', { name: '25th/75th percentiles', exact: true }).uncheck();
  await expect(table.getByRole('columnheader', { name: '25th percentile' })).toHaveCount(0);
  await expect(table.getByRole('columnheader', { name: 'Compared with England' })).toBeVisible();
  await options.getByRole('checkbox', { name: 'Comparison chart', exact: true }).uncheck();
  await expect(table.getByRole('columnheader', { name: 'Compared with England' })).toHaveCount(0);
  await options.getByRole('checkbox', { name: 'Minimum/Maximum values', exact: true }).check();
  await expect(table.getByRole('columnheader', { name: 'Highest', exact: true })).toBeVisible();
  await page.reload();
  await expect(table.getByRole('columnheader', { name: 'Highest', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Compared with England' })).toHaveCount(0);
});

test('keeps a table when only comparison columns are selected', async ({ page }) => {
  for (const [columns, heading] of [
    ['chart', 'Compared with England'],
    ['minmax', 'Lowest'],
    ['percentiles', '25th percentile'],
  ] as const) {
    await openIndicatorPage(
      page,
      `${MORTALITY_PATH}?as=E08000003&cmp-108=england&columns-108=${columns}`,
    );
    const table = trendTable(page);
    await expect(table.getByRole('columnheader', { name: heading, exact: true })).toBeVisible();
    await expect(table.locator('tbody tr').first()).toBeVisible();
    await expect(table.locator('[colspan="0"]')).toHaveCount(0);
    await expect(page.getByText('Select at least one table column.')).toHaveCount(0);
  }
});

test('downloads the default benchmark spread without an explicit column selection', async ({
  page,
}) => {
  const query = 'as=E08000003&cmp-108=england';
  await openIndicatorPage(page, `${MORTALITY_PATH}?${query}`);
  const table = trendTable(page);
  for (const name of ['Lowest', '25th percentile', '75th percentile', 'Highest']) {
    await expect(table.getByRole('columnheader', { name, exact: true })).toBeVisible();
  }
  const response = await page.request.get(`${MORTALITY_PATH}/table.csv?${query}`);
  expect(response.ok()).toBe(true);
  const csv = await response.text();
  const explicit = await page.request.get(
    `${MORTALITY_PATH}/table.csv?${query}&columns-108=value,95,minmax,percentiles,chart`,
  );
  expect(explicit.ok()).toBe(true);
  expect(csv).toBe(await explicit.text());
  expect(csv.split('\n')[0]).toMatch(/lowest,.*25th percentile,.*75th percentile,.*highest$/);
});

test('inequality options change the breakdown period', async ({ page }) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?tab-indicator=inequalities`);
  const options = page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('button', { name: 'Chart options', exact: true }) });
  await options
    .getByRole('radio', { name: /Districts and unitary authorities by deprivation \(IMD 2019,/ })
    .check();
  await expect(page).toHaveURL(/ic-108=/);
  const table = page.getByRole('table', {
    name: /Districts and unitary authorities by deprivation/,
  });
  await expect(table).toBeVisible();
  const period = await selectEarlierInequalityPeriod(options);
  await expect(page).toHaveURL((url) => url.searchParams.get('ip-108') === period.value);
  await expect(table.locator('caption')).toContainText(period.label);
});

test('selecting Male or Female carries inequalities figures and the England benchmark between tabs', async ({
  page,
}, testInfo) => {
  for (const [sex, englandValue, segmentValue] of [
    ['Male', '405.4', '553.4'],
    ['Female', '257.9', '347.3'],
  ] as const) {
    await openIndicatorPage(page, MORTALITY_PATH);
    const options = filterCard(page, 'Table columns');
    await options.getByRole('button', { name: 'Table columns', exact: true }).click();
    await options.getByLabel('Select sex').selectOption(sex);
    await expect(page).toHaveURL((url) => url.searchParams.get('sex-108') === sex);
    await page.getByRole('tab', { name: 'Inequalities', exact: true }).click();
    const table = page.locator('.fphd-inequalities-table');
    await expect(table.locator('caption')).toContainText(`, ${sex}`);
    await expect(page.locator('#indicator-inequalities .fphd-indicator-showing')).toContainText(
      sex,
    );
    await expect(
      table.getByRole('row', { name: /^England / }).locator('td:nth-last-child(2)'),
    ).toHaveText(englandValue);
    await expect(
      table
        .getByRole('row', { name: /^Decile 1 \(most deprived, IMD 2019\)/ })
        .locator('td:nth-last-child(2)'),
    ).toHaveText(segmentValue);
    const chart = page.getByRole('region', { name: /^Inequalities:/ });
    await expect(chart.getByRole('heading')).toContainText(`England, ${sex}`);
    await expect(
      chart.locator('text').filter({ hasText: `England average ${englandValue} per 100,000` }),
    ).toHaveCount(1);
    await chart.locator('.recharts-bar-rectangle').first().hover();
    await expect(chart.getByRole('status')).toContainText(`Value: ${segmentValue} per 100,000`);
    await expect(chart.getByRole('status')).toContainText(
      `England average: ${englandValue} per 100,000`,
    );
    await page
      .getByRole('tabpanel', { name: 'Inequalities', exact: true })
      .getByText('Download or share data', { exact: true })
      .click();
    const download = page.getByRole('link', {
      name: "Download data for the areas you've chosen (CSV)",
    });
    await expect(download).toHaveAttribute('href', new RegExp(`sex-108=${sex}`));
    await expectNoAccessibilityViolations(page, testInfo);
  }
});

test('a stale inequalities sex falls back to Persons in the table, chart and CSV', async ({
  page,
}, testInfo) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?tab-indicator=inequalities&sex-108=Unpublished`);
  const table = page.locator('.fphd-inequalities-table');
  await expect(
    table.getByRole('row', { name: /^England / }).locator('td:nth-last-child(2)'),
  ).toHaveText('329.4');
  await expect(
    table
      .getByRole('row', { name: /^Decile 1 \(most deprived, IMD 2019\)/ })
      .locator('td:nth-last-child(2)'),
  ).toHaveText('448.4');
  await expect(table.locator('caption')).not.toContainText('Unpublished');
  await expect(page.locator('#indicator-inequalities .fphd-indicator-showing')).not.toContainText(
    'Unpublished',
  );
  const chart = page.getByRole('region', { name: /^Inequalities:/ });
  await expect(
    chart.locator('text').filter({ hasText: 'England average 329.4 per 100,000' }),
  ).toHaveCount(1);
  await expect(page.getByText(/no inequality breakdowns/)).toHaveCount(0);
  await page
    .getByRole('tabpanel', { name: 'Inequalities', exact: true })
    .getByText('Download or share data', { exact: true })
    .click();
  const href = await page
    .getByRole('link', { name: "Download data for the areas you've chosen (CSV)" })
    .getAttribute('href');
  expect(href).toBeTruthy();
  const response = await page.request.get(href ?? '');
  expect(response.ok()).toBe(true);
  const rows = parse(await response.text(), { columns: true }) as Record<string, string>[];
  expect(rows[0]?.Segment).toBe('England');
  expect(Number(rows[0]?.['Value (per 100,000)'])).toBeCloseTo(329.412706, 4);
  expect(rows[1]?.Segment).toBe('Decile 1 (most deprived, IMD 2019)');
  expect(Number(rows[1]?.['Value (per 100,000)'])).toBeCloseTo(448.375398, 4);
  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('applies IMD 2025 and neighbours together through the benchmark GET form', async ({
    page,
  }) => {
    await page.goto('/indicator/diabetes-qof-prevalence?as=E08000003');
    const benchmarks = filterCard(page, 'Benchmarks');
    await benchmarks
      .getByRole('checkbox', {
        name: 'Areas with similar deprivation to the selected area (Index of Multiple Deprivation (IMD) 2025)',
        exact: true,
      })
      .check();
    await benchmarks
      .getByRole('checkbox', { name: 'Statistical neighbours (Manchester)', exact: true })
      .check();
    await benchmarks.getByRole('button', { name: 'Apply options', exact: true }).click();
    await expect(
      trendTable(page).getByRole('columnheader', { name: 'Decile 1 (IMD 2025)', exact: true }),
    ).toBeVisible();
    await expect(
      trendTable(page).getByRole('columnheader', {
        name: 'Statistical neighbours (Manchester)',
        exact: true,
      }),
    ).toBeVisible();
  });

  test('checks England for the first geography and keeps all benchmarks unticked after a GET submit', async ({
    page,
  }) => {
    await page.goto(`${MORTALITY_PATH}?geo-level=Upper-tier%20local%20authorities`);
    const geographies = page.locator('#indicator-data').locator('.fphd-filter-card', {
      has: page.getByRole('button', { name: 'Geographies', exact: true, includeHidden: true }),
    });
    await geographies.getByRole('checkbox', { name: 'Manchester', exact: true }).check();
    await geographies.getByRole('button', { name: 'Apply geographies' }).click();
    const benchmarks = filterCard(page, 'Benchmarks');
    const england = benchmarks.getByRole('checkbox', { name: 'England', exact: true });
    const region = benchmarks.getByRole('checkbox', { name: 'Statistical regions' });
    const apply = benchmarks.getByRole('button', { name: 'Apply options' });
    await expect(england).toBeChecked();
    await region.check();
    await apply.click();
    await expect(
      trendTable(page).getByRole('columnheader', { name: 'England', exact: true }),
    ).toBeVisible();
    await expect(
      trendTable(page).getByRole('columnheader', { name: 'North West (Statistical region)' }),
    ).toBeVisible();
    await england.uncheck();
    await region.uncheck();
    await apply.click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.has('cmp-108') && url.searchParams.getAll('cmp-108').join() === '',
    );
    // Reloading while the form's own navigation is still under way detaches the page.
    const submitted = page.waitForEvent('load');
    await geographies.getByRole('button', { name: 'Apply geographies' }).click();
    await submitted;
    await page.reload();
    await expect(england).not.toBeChecked();
    await expect(region).not.toBeChecked();
    await expect(
      trendTable(page).getByRole('columnheader', { name: 'England', exact: true }),
    ).toHaveCount(0);
  });

  test('preserves default and unchecked spread choices while the benchmark is hidden', async ({
    page,
  }) => {
    await page.goto(`${MORTALITY_PATH}?as=E08000003`);
    const options = filterCard(page, 'Table columns');
    const benchmarks = filterCard(page, 'Benchmarks');
    const benchmark = benchmarks.getByRole('checkbox', { name: 'England', exact: true });
    const applyBenchmarks = benchmarks.getByRole('button', { name: 'Apply options' });
    const apply = options.getByRole('button', { name: 'Apply options' });
    await options.getByLabel('Select sex').selectOption('Male');
    await apply.click();
    await benchmark.check();
    await applyBenchmarks.click();
    for (const name of ['Minimum/Maximum values', '25th/75th percentiles', 'Comparison chart']) {
      await expect(options.getByRole('checkbox', { name, exact: true })).toBeChecked();
      await options.getByRole('checkbox', { name, exact: true }).uncheck();
    }
    await apply.click();
    await benchmark.uncheck();
    await applyBenchmarks.click();
    await expect(page).toHaveURL((url) => url.searchParams.getAll('cmp-108').join() === '');
    await expect(options.getByRole('checkbox', { name: 'Comparison chart' })).toHaveCount(0);
    await benchmark.check();
    await applyBenchmarks.click();
    for (const name of ['Minimum/Maximum values', '25th/75th percentiles', 'Comparison chart']) {
      await expect(options.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
    }
  });

  test('table and inequality options apply through their Apply options buttons', async ({
    page,
  }) => {
    await page.goto(`${MORTALITY_PATH}?cr-108=yes&cr-compare=no`);
    await expect(page.getByRole('status').filter({ hasText: /^Loading / })).toHaveCount(0);
    const tableOptions = filterCard(page, 'Table columns');
    await tableOptions.getByLabel('Select sex').selectOption('Male');
    await tableOptions.getByLabel('Type of time period').selectOption('3 year rolling average');
    await tableOptions.getByRole('checkbox', { name: 'Count', exact: true }).check();
    await tableOptions.getByRole('button', { name: 'Apply options' }).click();

    await expect(page).toHaveURL(/sex-108=Male/);
    await expect(page).not.toHaveURL(/cr-/);
    await expect(page).toHaveURL(/pt-108=3-year/);
    await expect(page).toHaveURL(/#indicator-data$/);
    const table = trendTable(page);
    await expect(table).toHaveAccessibleName(
      /<75 yrs, Male\s*, table with \d+ rows and \d+ columns$/,
    );
    await expect(table.getByRole('rowheader', { name: '2015 to 2017', exact: true })).toBeVisible();
    await expect(table.getByRole('rowheader', { name: '2024', exact: true })).toHaveCount(0);
    await expect(table.getByRole('columnheader', { name: 'Count', exact: true })).toBeVisible();

    const inequalityOptions = filterCard(page, 'Chart options');
    await inequalityOptions
      .getByRole('radio', { name: /Districts and unitary authorities by deprivation \(IMD 2019,/ })
      .check();
    await inequalityOptions.getByRole('button', { name: 'Apply options' }).click();
    await expect(page).toHaveURL(/ic-108=/);
    await expect(page).toHaveURL(/#indicator-inequalities$/);
    const period = await selectEarlierInequalityPeriod(inequalityOptions);
    await inequalityOptions.getByRole('button', { name: 'Apply options' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('ip-108') === period.value);
    const inequalityTable = page.getByRole('table', {
      name: /Districts and unitary authorities by deprivation/,
    });
    await expect(inequalityTable.locator('caption')).toContainText(period.label);
    await expect(page).toHaveURL(/sex-108=Male/);
  });
});
