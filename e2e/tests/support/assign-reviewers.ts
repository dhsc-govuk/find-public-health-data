import { type Browser, expect, type Page } from '@playwright/test';

import { IMRG_MANAGER } from './sign-in.ts';

/** Chooses a reviewer by name: the count beside it moves as other specs assign reviewers. */
export async function chooseReviewer(page: Page, name: string) {
  const select = page.getByLabel('Reviewer', { exact: true });
  const value = await select
    .getByRole('option', { name: `${name} (`, includeHidden: true })
    .getAttribute('value');
  await select.selectOption(value ?? '');
}

export async function addReviewer(page: Page, name: string) {
  await chooseReviewer(page, name);
  await page.getByRole('button', { name: /^Add (another )?reviewer$/ }).click();
  await expect(page.getByRole('button', { name: `Remove reviewer ${name}` })).toBeVisible();
}

/**
 * Assigns the named reviewers to a submitted indicator as the IMRG manager, in a browser context
 * of their own, for tests whose user comes to it once it is in review.
 */
export async function assignReviewers(browser: Browser, id: string, names: readonly string[]) {
  const context = await browser.newContext({ storageState: IMRG_MANAGER.storageState });
  try {
    const page = await context.newPage();
    await page.goto(`/dashboard/indicators/${id}/assign-reviewers`);
    for (const name of names) {
      await addReviewer(page, name);
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
  } finally {
    await context.close();
  }
}
