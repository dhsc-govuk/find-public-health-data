import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { createDraft, createIndicator, uniqueIndicatorName } from '../support/create-indicator.ts';
import { expectHydrated } from '../support/govuk-frontend.ts';
import { expectNotFoundWithoutDraft, taskRow } from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const HEADING = 'Upload indicator data table';
const PROBLEMS_HEADING = 'There is a problem with the indicator data table you uploaded';

const VALID_CSV = [
  'area_code,period_start,period_end,value,sex',
  'E92000001,2019-04-01,2020-03-31,83.8,Female',
  'E92000001,2019-04-01,2020-03-31,83.1,Persons',
].join('\n');

// No period_end column, and area codes no area has.
const INVALID_CSV = [
  'area_code,period_start,value',
  'E92000000,2019-04-01,83.8',
  'E93000000,2019-04-01,83.1',
].join('\n');

test.use({ storageState: PUBLISHER.storageState });

/** Opens a new draft's upload page by its address and returns the draft's id. */
async function openUploadPage(page: Page): Promise<string> {
  const id = await createDraft(page, uniqueIndicatorName('data table'));
  await page.goto(`/publish/indicators/${id}/data-table`);
  await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
  return id;
}

async function chooseFile(page: Page, name: string, content: string) {
  await page.getByLabel(HEADING).setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(content),
  });
}

async function continueWithFile(page: Page, name: string, content: string) {
  await chooseFile(page, name, content);
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('is reached from the data table task on the task list', async ({ page }) => {
  await createIndicator(page, uniqueIndicatorName('data table'));
  await expect(taskRow(page, 'Data table')).toContainText('Incomplete');

  await taskRow(page, 'Data table').getByRole('link', { name: 'Data table' }).click();

  await expect(page).toHaveURL(/\/publish\/indicators\/[0-9a-f-]{36}\/data-table$/);
  await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
});

test('uploads a data table and moves on to check it, leaving the task incomplete', async ({
  page,
}) => {
  const id = await openUploadPage(page);

  await continueWithFile(page, 'life-expectancy.csv', VALID_CSV);

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/check`);
  await page.goto(`/publish/indicators/${id}/task-list`);
  await expect(taskRow(page, 'Data table')).toContainText('Incomplete');
});

/** Counts the forms the page sends to the upload page, which a browser refusal sends none of. */
function countUploads(page: Page): () => number {
  let uploads = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/data-table(\.data)?$/.test(new URL(request.url()).pathname)
    ) {
      uploads += 1;
    }
  });
  return () => uploads;
}

test('asks for a data table when Continue is selected without one, sending nothing', async ({
  page,
}) => {
  await openUploadPage(page);
  await expectHydrated(page);
  const uploads = countUploads(page);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveTitle(/^Error: /);
  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Select a data table']);
  await expect(page.locator('.govuk-error-summary')).toBeFocused();
  await expect(page.getByRole('status')).toHaveText('');
  expect(uploads()).toBe(0);
  await summary.getByRole('link', { name: 'Select a data table' }).click();
  await expect(page.getByLabel(HEADING)).toBeFocused();
});

test('refuses a file that is not a CSV, or is empty, without sending it', async ({ page }) => {
  await openUploadPage(page);
  await expectHydrated(page);
  const uploads = countUploads(page);

  await continueWithFile(page, 'life-expectancy.xlsx', VALID_CSV);
  await expect(page.getByRole('alert')).toContainText('The selected file must be a CSV');

  await continueWithFile(page, 'empty.csv', '');
  await expect(page.getByRole('alert')).toContainText('The selected file is empty');
  expect(uploads()).toBe(0);
});

test('refuses a file over 100MB without sending it', async ({ page }) => {
  await openUploadPage(page);
  await expectHydrated(page);
  const uploads = countUploads(page);

  // Made in the page, one byte over the cap, rather than sent from here.
  await page.getByLabel(HEADING).evaluate((input: HTMLInputElement) => {
    const files = new DataTransfer();
    files.items.add(new File([new Uint8Array(100_000_001)], 'large.csv', { type: 'text/csv' }));
    input.files = files.files;
  });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'The selected file must be smaller than 100MB',
  );
  await expect(page.getByRole('status')).toHaveText('');
  expect(uploads()).toBe(0);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('uploads a data table and moves on to check it', async ({ page }) => {
    const id = await openUploadPage(page);

    await continueWithFile(page, 'life-expectancy.csv', VALID_CSV);

    await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/check`);
  });

  for (const [what, name, message] of [
    ['no file', undefined, 'Select a data table'],
    ['a file that is not a CSV', 'life-expectancy.xlsx', 'The selected file must be a CSV'],
    ['an empty file', 'empty.csv', 'The selected file is empty'],
  ] as const) {
    test(`refuses ${what} with the same error from the server`, async ({ page }) => {
      await openUploadPage(page);

      if (name !== undefined) await chooseFile(page, name, name === 'empty.csv' ? '' : VALID_CSV);
      await page.getByRole('button', { name: 'Continue' }).click();

      await expect(page).toHaveTitle(/^Error: /);
      await expect(page.getByRole('alert').getByRole('link')).toHaveText([message]);
      await expect(page.getByRole('status')).toHaveText('');
    });
  }
});

test('answers a form too big for any acceptable file with the error page, not a reset', async ({
  page,
}) => {
  const id = await openUploadPage(page);

  const response = await page.request.post(`/publish/indicators/${id}/data-table`, {
    multipart: {
      dataTable: { name: 'large.csv', mimeType: 'text/csv', buffer: Buffer.alloc(101_500_000) },
    },
  });

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('The selected file must be smaller than 100MB');
});

test('lists the problems with a data table that fails validation', async ({ page }) => {
  const id = await openUploadPage(page);

  await continueWithFile(page, 'life-expectancy.csv', INVALID_CSV);

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/problems`);
  await expect(page.getByRole('heading', { level: 1, name: PROBLEMS_HEADING })).toBeVisible();
  const rows = page.getByRole('main').getByRole('row');
  await expect(rows.filter({ hasText: 'period_end column missing' })).toContainText(
    'does not contain a period_end column',
  );
  const areaCodes = rows.filter({ hasText: 'Area codes could not be matched to reference data' });
  await expect(areaCodes).toContainText('There are 2 instances of area codes');
  await expect(areaCodes.getByRole('listitem')).toContainText([
    'E92000000',
    'E93000000',
    'check you uploaded the correct data table',
    'check the reference data codes you intended',
    'fix the data table and re-upload it',
  ]);
});

test('offers a different or corrected data table from the problems page', async ({ page }) => {
  const id = await openUploadPage(page);
  await continueWithFile(page, 'life-expectancy.csv', INVALID_CSV);
  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/problems`);

  await page.getByRole('button', { name: 'Upload different or corrected data table' }).click();
  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table`);
  await continueWithFile(page, 'life-expectancy.csv', VALID_CSV);

  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/check`);
  await page.goto(`/publish/indicators/${id}/data-table/problems`);
  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table`);
});

test('links back to the task list, and from the problems page to the upload', async ({ page }) => {
  const id = await openUploadPage(page);
  await continueWithFile(page, 'life-expectancy.csv', INVALID_CSV);

  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table`);
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(`/publish/indicators/${id}/task-list`);
});

test('answers an indicator with nothing to upload to with the not-found page', async ({ page }) => {
  await expectNotFoundWithoutDraft(page, 'data-table');
});

test('has no WCAG 2.2 AA violations on the upload page', async ({ page }, testInfo) => {
  await openUploadPage(page);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the file is refused', async ({ page }, testInfo) => {
  await openUploadPage(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations on the problems page', async ({ page }, testInfo) => {
  const id = await openUploadPage(page);
  await continueWithFile(page, 'life-expectancy.csv', INVALID_CSV);
  await expect(page).toHaveURL(`/publish/indicators/${id}/data-table/problems`);

  await expectNoAccessibilityViolations(page, testInfo);
});
