import { type Browser, expect, type Page } from '@playwright/test';

import { createDraft } from './create-indicator.ts';
import { PUBLISHER } from './sign-in.ts';

/** Fetches a section page and returns the version in its form, which a save must send back. */
export async function shownVersion(page: Page, path: string): Promise<string> {
  const html = await (await page.request.get(path)).text();
  const version = /<input[^>]*name="version"[^>]*value="([0-9a-f]{64})"/.exec(html)?.[1];
  expect(version, `${path} carries no version`).toBeDefined();
  return version ?? '';
}

/**
 * Answers every task on a new draft, data table included, so that it may be submitted. Posts the
 * task list's sample answers form as its button does; the section specs cover each page's form.
 */
export async function completeDraft(page: Page, id: string): Promise<void> {
  const base = `/publish/indicators/${id}`;
  const response = await page.request.post(`${base}/sample-answers`, { maxRedirects: 0 });
  expect(response.headers().location, 'the sample answers were refused').toBe(`${base}/task-list`);
}

/** Submits a complete draft for approval from its task list, as the publisher's button does. */
export async function submitDraft(page: Page, id: string): Promise<void> {
  await page.goto(`/publish/indicators/${id}/task-list`);
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
}

/**
 * Creates, completes and submits a new indicator as the publisher, in a browser context of their
 * own, for tests whose user comes to it after submission. Answers its id.
 */
export async function submitNewIndicator(browser: Browser, name: string): Promise<string> {
  const context = await browser.newContext({ storageState: PUBLISHER.storageState });
  try {
    const page = await context.newPage();
    const id = await createDraft(page, name);
    await completeDraft(page, id);
    await submitDraft(page, id);
    return id;
  } finally {
    await context.close();
  }
}
