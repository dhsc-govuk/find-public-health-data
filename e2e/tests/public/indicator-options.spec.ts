import { expect, type Locator, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { filterCard, MORTALITY_PATH, openIndicatorPage } from '../support/indicator-page.ts';

function trendTable(page: import('@playwright/test').Page) {
  return page.getByRole('table', { name: /^Table:/ });
}

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
  await options.getByLabel('Select time period type').selectOption('1 year');
  await expect(page).toHaveURL(/pt-108=1-year/);
  await expect(table.getByRole('rowheader', { name: '2015 to 2017', exact: true })).toHaveCount(0);
  await options.getByRole('checkbox', { name: '95% confidence intervals', exact: true }).check();
  await options.getByRole('checkbox', { name: 'Numerator', exact: true }).check();
  await expect(table.getByRole('columnheader', { name: 'Numerator', exact: true })).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: '95% lower confidence interval' }),
  ).toBeVisible();
  await page.reload();
  await expect(table).toHaveAccessibleName(
    /<75 yrs, Male\s*, table with \d+ rows and \d+ columns$/,
  );
  await expectNoAccessibilityViolations(page, testInfo);
});

test('selected geography and benchmark options stay on the one indicator page', async ({
  page,
}) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?as=E08000003`);
  const options = page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('button', { name: 'Table columns', exact: true }) });
  await options.getByRole('button', { name: 'Table columns', exact: true }).click();
  await options.getByLabel('Select a geography or goal to compare with').selectOption('England');
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

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('preserves default and unchecked spread choices while the benchmark is hidden', async ({
    page,
  }) => {
    await page.goto(`${MORTALITY_PATH}?as=E08000003`);
    const options = filterCard(page, 'Table columns');
    const benchmark = options.getByLabel('Select a geography or goal to compare with');
    const apply = options.getByRole('button', { name: 'Apply options' });
    await options.getByLabel('Select sex').selectOption('Male');
    await apply.click();
    await benchmark.selectOption('england');
    await apply.click();
    for (const name of ['Minimum/Maximum values', '25th/75th percentiles', 'Comparison chart']) {
      await expect(options.getByRole('checkbox', { name, exact: true })).toBeChecked();
      await options.getByRole('checkbox', { name, exact: true }).uncheck();
    }
    await apply.click();
    await benchmark.selectOption('none');
    await apply.click();
    await expect(options.getByRole('checkbox', { name: 'Comparison chart' })).toHaveCount(0);
    await benchmark.selectOption('england');
    await apply.click();
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
    await tableOptions.getByLabel('Select time period type').selectOption('1 year');
    await tableOptions.getByRole('checkbox', { name: 'Numerator', exact: true }).check();
    await tableOptions.getByRole('button', { name: 'Apply options' }).click();

    await expect(page).toHaveURL(/sex-108=Male/);
    await expect(page).not.toHaveURL(/cr-/);
    await expect(page).toHaveURL(/pt-108=1-year/);
    await expect(page).toHaveURL(/#indicator-data$/);
    const table = trendTable(page);
    await expect(table).toHaveAccessibleName(
      /<75 yrs, Male\s*, table with \d+ rows and \d+ columns$/,
    );
    await expect(table.getByRole('rowheader', { name: '2015 to 2017', exact: true })).toHaveCount(
      0,
    );
    await expect(table.getByRole('columnheader', { name: 'Numerator', exact: true })).toBeVisible();

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
