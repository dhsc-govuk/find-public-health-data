import { expect, type Locator, type Page } from '@playwright/test';

import { createDraft, uniqueIndicatorName } from './create-indicator.ts';

/** Submits the upload form, as Continue does, and returns the page it redirects to. */
export async function uploadDataTable(page: Page, id: string, content: string): Promise<string> {
  const response = await page.request.post(`/publish/indicators/${id}/data-table`, {
    multipart: {
      dataTable: { name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(content) },
    },
    maxRedirects: 0,
  });
  return response.headers().location ?? '';
}

/** Creates a draft, uploads a data table to it and opens its check page. Returns the draft's id. */
export async function openDataTableCheck(page: Page, content: string): Promise<string> {
  const id = await createDraft(page, uniqueIndicatorName('check data'));
  expect(await uploadDataTable(page, id, content)).toBe(
    `/publish/indicators/${id}/data-table/check`,
  );
  await page.goto(`/publish/indicators/${id}/data-table/check`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Check the indicator data table' }),
  ).toBeVisible();
  return id;
}

/** The rows the check page shows. */
export function dataTableRows(page: Page): Locator {
  return page.getByRole('region', { name: 'Data table' }).locator('tbody tr');
}
