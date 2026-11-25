import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { dataTableRows, openDataTableCheck, uploadDataTable } from '../support/data-table.ts';
import { expectNotFoundWithoutDraft, taskRow } from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const HEADING = 'Check the indicator data table';

// 23 calendar years for England, so 10 rows a page makes three pages.
const CSV = [
  'area_code,period_start,period_end,value,lower_ci_95,upper_ci_95,sex',
  ...Array.from({ length: 23 }, (_, index) => {
    const year = 2001 + index;
    return `E92000001,${year}-01-01,${year}-12-31,${(800 + index) / 10},${(790 + index) / 10},${(810 + index) / 10},Female`;
  }),
].join('\n');

const REPLACEMENT_CSV = [
  'area_code,period_start,period_end,value',
  'E92000001,2019-04-01,2020-03-31,83.8',
].join('\n');

test.use({ storageState: PUBLISHER.storageState });

/** Opens the check page of a new draft with the 23-row table. Returns the draft's id. */
function openCheckPage(page: Page): Promise<string> {
  return openDataTableCheck(page, CSV);
}

test('is reached by uploading a data table', async ({ page }) => {
  const id = await createDraft(page, uniqueIndicatorName('check data'));
  await page.goto(`/publish/indicators/${id}/data-table`);

  await page.getByLabel('Upload indicator data table').setInputFiles({
    name: 'data.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/check`);
  await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
});

test('shows a preview of the uploaded data table', async ({ page }) => {
  await openCheckPage(page);

  await expect(page.getByText('Your upload contains 23 rows')).toBeVisible();
  const table = page.getByRole('region', { name: 'Data table' }).getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Value',
    'Lower CI 95.0 limit',
    'Upper CI 95.0 limit',
    'Period',
    'Area code',
    'Sex',
  ]);
  await expect(dataTableRows(page)).toHaveCount(10);
  await expect(dataTableRows(page).first().locator('th, td')).toHaveText([
    '80',
    '79',
    '81',
    '2001',
    'E92000001',
    'Female',
  ]);
  await expect(page.getByText('Showing 1 to 10 of 23 rows')).toBeVisible();
});

test('shows the count, numerator and denominator before the value, in separate columns', async ({
  page,
}) => {
  const csv = [
    'area_code,period_start,period_end,value,count,numerator,denominator',
    'E92000001,2019-01-01,2019-12-31,25,120,100,400',
  ].join('\n');
  await openDataTableCheck(page, csv);

  const table = page.getByRole('region', { name: 'Data table' }).getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Count',
    'Numerator',
    'Denominator',
    'Value',
    'Period',
    'Area code',
  ]);
  await expect(dataTableRows(page).first().locator('th, td')).toHaveText([
    '120',
    '100',
    '400',
    '25',
    '2019',
    'E92000001',
  ]);
});

test('pages through the data table', async ({ page }) => {
  const id = await openCheckPage(page);
  const pages = page.getByRole('navigation', { name: 'Data table pages' });

  await pages.getByRole('link', { name: /Next/ }).click();

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/check?page=2`);
  await expect(page.getByText('Showing 11 to 20 of 23 rows')).toBeVisible();
  await expect(dataTableRows(page).first().locator('th, td').nth(3)).toHaveText('2011');

  await pages.getByRole('link', { name: '3' }).click();
  await expect(page.getByText('Showing 21 to 23 of 23 rows')).toBeVisible();
  await expect(dataTableRows(page)).toHaveCount(3);
});

test('changes the number of rows per page', async ({ page }) => {
  const id = await openCheckPage(page);
  await page
    .getByRole('navigation', { name: 'Data table pages' })
    .getByRole('link', { name: '2' })
    .click();

  await page.getByLabel('Rows per page').selectOption('25');
  await page.getByRole('button', { name: 'Apply' }).click();

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/check?rowsPerPage=25`);
  await expect(dataTableRows(page)).toHaveCount(23);
  await expect(page.getByText('Showing 1 to 23 of 23 rows')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Data table pages' })).toHaveCount(0);
  await expect(page.getByLabel('Rows per page')).toHaveValue('25');
});

test('confirms the data table and returns to the task list showing it completed', async ({
  page,
}) => {
  const id = await openCheckPage(page);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(`/publish/indicators/${id}/task-list`);
  await expect(taskRow(page, 'Data table')).toContainText('Completed');
  await taskRow(page, 'Data table').getByRole('link', { name: 'Data table' }).click();
  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/check`);
});

test('links an unconfirmed data table on the task list to its check page', async ({ page }) => {
  const id = await openCheckPage(page);
  await page.goto(`/publish/indicators/${id}/task-list`);

  await expect(taskRow(page, 'Data table')).toContainText('Incomplete');
  await taskRow(page, 'Data table').getByRole('link', { name: 'Data table' }).click();

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/check`);
});

test('offers a different data table instead', async ({ page }) => {
  const id = await openCheckPage(page);

  await page.getByRole('button', { name: 'Choose a different data table' }).click();

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table`);
  await page.goto(`/publish/indicators/${id}/task-list`);
  await expect(taskRow(page, 'Data table')).toContainText('Incomplete');
});

test('shows the new data table when another upload replaced it before Continue', async ({
  page,
}) => {
  const id = await openCheckPage(page);
  await uploadDataTable(page, id, REPLACEMENT_CSV);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveTitle(/^Error: /);
  await expect(page.getByRole('alert')).toContainText(
    'Another data table was uploaded while you were checking this one. Check the new data table.',
  );
  await expect(page.getByText('Your upload contains 1 row')).toBeVisible();
  await expect(dataTableRows(page).first().locator('th, td')).toHaveText([
    '83.8',
    '2019/20',
    'E92000001',
  ]);
  await page.goto(`/publish/indicators/${id}/task-list`);
  await expect(taskRow(page, 'Data table')).toContainText('Incomplete');
});

test('sends a draft with no data table to the upload page', async ({ page }) => {
  const id = await createDraft(page, uniqueIndicatorName('check data'));

  await page.goto(`/publish/indicators/${id}/data-table/check`);

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table`);
});

test('links back to the upload page', async ({ page }) => {
  const id = await openCheckPage(page);

  await page.getByRole('link', { name: 'Back', exact: true }).click();

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table`);
});

test('answers an indicator with nothing to check with the not-found page', async ({ page }) => {
  await expectNotFoundWithoutDraft(page, 'data-table/check');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('changes the rows per page and confirms the data table', async ({ page }) => {
    const id = await openCheckPage(page);

    await page.getByLabel('Rows per page').selectOption('50');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(dataTableRows(page)).toHaveCount(23);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(`/publish/indicators/${id}/task-list`);
    await expect(taskRow(page, 'Data table')).toContainText('Completed');
  });
});

test('has no WCAG 2.2 AA violations on the check page', async ({ page }, testInfo) => {
  await openCheckPage(page);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the table was replaced', async ({ page }, testInfo) => {
  const id = await openCheckPage(page);
  await uploadDataTable(page, id, REPLACEMENT_CSV);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});
