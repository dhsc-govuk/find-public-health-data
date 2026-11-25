import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { dataTableRows, openDataTableCheck, uploadDataTable } from '../support/data-table.ts';
import { expectHydrated } from '../support/govuk-frontend.ts';
import { taskRow } from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

/** A row for England for each year from the first, for Female in odd years and Male in even. */
function csv(firstYear: number, years: number): string {
  return [
    'area_code,period_start,period_end,value,sex',
    ...Array.from({ length: years }, (_, index) => {
      const year = firstYear + index;
      return `E92000001,${year}-01-01,${year}-12-31,${year / 10},${year % 2 ? 'Female' : 'Male'}`;
    }),
  ].join('\n');
}

// 23 years, so 12 rows for Female make two pages.
const CSV = csv(2001, 23);

test.use({ storageState: PUBLISHER.storageState });

function chips(page: Page) {
  return page.locator('.fphd-column-filters .fphd-filter-chip');
}

function periods(page: Page) {
  return dataTableRows(page).locator('td:nth-child(2)');
}

function column(page: Page, name: string) {
  return page
    .getByRole('region', { name: 'Table columns and values' })
    .getByRole('button', { name, exact: true });
}

/** Opens a column, once the page's scripts are ready for it. */
async function openColumn(page: Page, name: string): Promise<void> {
  await expectHydrated(page);
  await column(page, name).click();
}

/** Opens a column, ticks some of its values and adds them. */
async function addValues(page: Page, name: string, ...values: string[]): Promise<void> {
  await openColumn(page, name);
  for (const value of values) await page.getByLabel(value, { exact: true }).check();
  await page.getByRole('button', { name: `Add values (${values.length})` }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
}

test('shows the rows with any value chosen in a column', async ({ page }) => {
  await openDataTableCheck(page, CSV);

  await addValues(page, 'Period', '2004', '2003');

  await expect(chips(page)).toHaveText([/2004 \(Period\)/, /2003 \(Period\)/]);
  await expect(page.getByText('Showing 1 to 2 of 2 rows')).toBeVisible();
  await expect(periods(page)).toHaveText(['2003', '2004']);
  await expect(page.getByText('Your upload contains 23 rows')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Selected values' })).toBeFocused();
});

test('shows the rows that match every column chosen from', async ({ page }) => {
  await openDataTableCheck(page, CSV);

  await addValues(page, 'Period', '2004', '2003');
  await addValues(page, 'Sex', 'Male');

  await expect(periods(page)).toHaveText(['2004']);

  await page.getByRole('link', { name: 'Remove 2004 (Period) filter' }).click();
  await expect(chips(page)).toHaveText([/2003 \(Period\)/, /Male \(Sex\)/]);
  await expect(page.getByText('No rows match these filters')).toBeVisible();
  await expect(dataTableRows(page)).toHaveCount(0);

  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expect(chips(page)).toHaveCount(0);
  await expect(page.getByText('Showing 1 to 10 of 23 rows')).toBeVisible();
});

test('keeps the filters on every page, and starts again at the first when they change', async ({
  page,
}) => {
  const id = await openDataTableCheck(page, CSV);
  await addValues(page, 'Sex', 'Female');

  await page
    .getByRole('navigation', { name: 'Data table pages' })
    .getByRole('link', { name: /Next/ })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/publish/indicators/${id}/data-table/check\\?page=2&f=sex\\.[0-9a-f]{10}$`),
  );
  await expect(page.getByText('Showing 11 to 12 of 12 rows')).toBeVisible();
  await expect(periods(page)).toHaveText(['2021', '2023']);

  await addValues(page, 'Period', '2021');
  await expect(page).not.toHaveURL(/page=/);
  await expect(periods(page)).toHaveText(['2021']);
});

test('keeps the filters and the rows per page when either changes', async ({ page }) => {
  await openDataTableCheck(page, CSV);
  await addValues(page, 'Sex', 'Female');

  await page.getByLabel('Rows per page').selectOption('25');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Showing 1 to 12 of 12 rows')).toBeVisible();
  await expect(chips(page)).toHaveText([/Female \(Sex\)/]);

  await addValues(page, 'Sex', 'Male');
  await expect(page.getByText('Showing 1 to 23 of 23 rows')).toBeVisible();
  await expect(page.getByLabel('Rows per page')).toHaveValue('25');
});

test('keeps the filters on values another upload still has', async ({ page }) => {
  const id = await openDataTableCheck(page, CSV);
  await addValues(page, 'Period', '2003', '2023');
  await uploadDataTable(page, id, csv(2020, 5));

  await page.reload();

  await expect(chips(page)).toHaveText([/2023 \(Period\)/]);
  await expect(periods(page)).toHaveText(['2023']);
  await expect(page.getByText('Your upload contains 5 rows')).toBeVisible();
});

test('filters by up to 100 values', async ({ page }) => {
  await openDataTableCheck(page, csv(1900, 120));
  await openColumn(page, 'Period');
  await expect(page.getByText('Showing the first 100 — search to find the rest')).toBeVisible();
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(100);
  for (const box of await boxes.all()) await box.check();

  await page.getByRole('button', { name: 'Add values (100)' }).click();

  await expect(chips(page)).toHaveCount(100);
  await expect(page.getByText('Showing 1 to 10 of 100 rows')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Data table pages' })
    .getByRole('link', { name: /Next/ })
    .click();
  await expect(page.getByText('Showing 11 to 20 of 100 rows')).toBeVisible();
  await page.getByLabel('Rows per page').selectOption('50');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Showing 1 to 50 of 100 rows')).toBeVisible();
  await expect(chips(page)).toHaveCount(100);

  await addValues(page, 'Sex', 'Female');
  await expect(chips(page)).toHaveCount(100);
  await expect(
    page.getByText('You can select up to 100 values. Only the first 100 have been selected.'),
  ).toBeVisible();
});

test('finds values in any column as they are typed, keeping the search out of the address', async ({
  page,
}) => {
  const id = await openDataTableCheck(page, CSV);
  await expectHydrated(page);

  await page.getByLabel('Add values').fill('2003');
  await page.getByLabel('2003', { exact: true }).check();
  await page.getByLabel('Add values').fill('FEM');
  await page.getByLabel('Female', { exact: true }).check();
  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/check`);
  await page.getByRole('button', { name: 'Add values (2)' }).click();

  await expect(chips(page)).toHaveText([/2003 \(Period\)/, /Female \(Sex\)/]);
  await expect(periods(page)).toHaveText(['2003']);
  await expect(page.getByLabel('Add values')).toHaveValue('');

  await page.getByLabel('Add values').fill('<1 yr');
  await expect(page.getByText('No values match your search.')).toBeVisible();
});

test('finds values when Enter is pressed before the scripts are ready', async ({ page }) => {
  const id = await openDataTableCheck(page, CSV);
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'script' ? route.abort() : route.continue(),
  );
  await page.reload();

  await page.getByLabel('Add values').fill('2003');
  await page.getByLabel('Add values').press('Enter');

  await expect(page.getByLabel('2003', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Add values')).toHaveValue('2003');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.unrouteAll();
  await page.goto(`/publish/indicators/${id}/task-list`);
  await expect(taskRow(page, 'Data table')).toContainText('Incomplete');
});

test('shows the rows with an empty cell', async ({ page }) => {
  await openDataTableCheck(
    page,
    [
      'area_code,period_start,period_end,value,sex',
      'E92000001,2021-01-01,2021-12-31,,Female',
      'E92000001,2022-01-01,2022-12-31,9,Female',
      'E92000001,2023-01-01,2023-12-31,10,',
    ].join('\n'),
  );

  await addValues(page, 'Value', 'Blank', '9');
  await expect(chips(page)).toHaveText([/Blank \(Value\)/, /9 \(Value\)/]);
  await expect(periods(page)).toHaveText(['2021', '2022']);

  await page.getByRole('link', { name: 'Clear filters' }).click();
  await addValues(page, 'Sex', 'Blank');
  await expect(periods(page)).toHaveText(['2023']);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('filters by the values ticked', async ({ page }) => {
    await openDataTableCheck(page, CSV);
    await expect(column(page, 'Period')).toBeHidden();

    await page.getByRole('button', { name: 'Show values in Period' }).click();
    await page.getByLabel('2003', { exact: true }).check();
    await page.getByRole('button', { name: 'Show values in Sex' }).click();
    await page.getByLabel('Female', { exact: true }).check();
    await page.getByRole('button', { name: 'Add values' }).click();

    await expect(chips(page)).toHaveText([/2003 \(Period\)/, /Female \(Sex\)/]);
    await expect(periods(page)).toHaveText(['2003']);

    await page.getByRole('link', { name: 'Remove 2003 (Period) filter' }).click();
    await expect(page.getByText('Showing 1 to 10 of 12 rows')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Data table pages' })
      .getByRole('link', { name: /Next/ })
      .click();
    await expect(periods(page)).toHaveText(['2021', '2023']);
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page.getByText('Showing 1 to 10 of 23 rows')).toBeVisible();
  });

  test('finds values, keeping the filters, the page, the open column and the ticks', async ({
    page,
  }) => {
    const id = await openDataTableCheck(page, CSV);
    await page.getByRole('button', { name: 'Show values in Sex' }).click();
    await page.getByLabel('Female', { exact: true }).check();
    await page.getByRole('button', { name: 'Add values' }).click();
    await page
      .getByRole('navigation', { name: 'Data table pages' })
      .getByRole('link', { name: /Next/ })
      .click();
    await page.getByRole('button', { name: 'Show values in Period' }).click();
    await page.getByLabel('2021', { exact: true }).check();

    await page.getByLabel('Add values').fill('<2');
    await page.getByRole('button', { name: 'Find values' }).click();

    await expect(page.getByText('No values match your search.')).toBeVisible();
    await expect(page.getByLabel('Add values')).toHaveValue('<2');
    await expect(chips(page)).toHaveText([/Female \(Sex\)/]);
    await expect(periods(page)).toHaveText(['2021', '2023']);
    await expect(page).not.toHaveURL(/search|%3C/);

    await page.getByLabel('Add values').fill('2023');
    await page.getByRole('button', { name: 'Find values' }).click();
    await page.getByLabel('2023', { exact: true }).check();
    await page.getByLabel('Add values').fill('');
    await page.getByRole('button', { name: 'Find values' }).click();
    await expect(page.getByLabel('2021', { exact: true })).toBeChecked();
    await expect(page.getByLabel('2023', { exact: true })).toBeChecked();

    await page.getByRole('button', { name: 'Add values' }).click();
    await expect(chips(page)).toHaveText([/Female \(Sex\)/, /2023 \(Period\)/, /2021 \(Period\)/]);
    await expect(page).toHaveURL(new RegExp(`/publish/indicators/${id}/data-table/check\\?f=`));
    await expect(page.getByText('Showing 1 to 2 of 2 rows')).toBeVisible();
  });

  test('does not confirm the data table when a search is sent or reloaded', async ({ page }) => {
    const id = await openDataTableCheck(page, CSV);
    await page.getByLabel('Add values').fill('2003');
    await page.getByRole('button', { name: 'Find values' }).click();
    await expect(page.getByLabel('2003', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('2003', { exact: true })).toBeVisible();
    await page.goto(`/publish/indicators/${id}/task-list`);
    await expect(taskRow(page, 'Data table')).toContainText('Incomplete');
  });
});

test('answers a filter that is not one with the not-found page', async ({ page }) => {
  const id = await openDataTableCheck(page, CSV);

  const response = await page.goto(`/publish/indicators/${id}/data-table/check?f=sex.Female`);

  expect(response?.status()).toBe(404);
});

test('has no WCAG 2.2 AA violations with a column open and values selected', async ({
  page,
}, testInfo) => {
  await openDataTableCheck(page, CSV);
  await addValues(page, 'Sex', 'Female');
  await openColumn(page, 'Period');
  await page.getByLabel('2003', { exact: true }).check();

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations with values found', async ({ page }, testInfo) => {
  await openDataTableCheck(page, CSV);
  await expectHydrated(page);
  await page.getByLabel('Add values').fill('2003');
  await page.getByLabel('2003', { exact: true }).check();

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when no rows match', async ({ page }, testInfo) => {
  await openDataTableCheck(page, CSV);
  await addValues(page, 'Period', '2003');
  await addValues(page, 'Sex', 'Male');
  await expect(page.getByText('No rows match these filters')).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});
